import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import TransactionCard from "../../components/marketplace/TransactionCard";
import { marketplace } from "../../services/api";
import type { MarketplaceTransaction } from "../../types";

/**
 * Transactions surface (REQ-15/16/17/18/19). Sources the caller's own
 * transactions from `GET /marketplace/transactions` (buyer OR seller, newest
 * first), so a buyer can reach "Confirm receipt" / adjust / cancel on their
 * pending transactions and both parties can reach the review form on completed
 * ones. Each row renders a full `TransactionCard` (confirm / cancel / adjust /
 * review).
 */
export default function MarketplaceTransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<MarketplaceTransaction[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError(null);
    marketplace
      .getTransactions()
      .then((response) => {
        if (active) setTransactions(response.transactions);
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
        ) : !transactions || transactions.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            No transactions yet.
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((transaction) => (
              <TransactionCard
                key={transaction.id}
                transactionId={transaction.id}
                currentUserId={user!.id}
                onChanged={() => setRefreshKey((key) => key + 1)}
              />
            ))}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
