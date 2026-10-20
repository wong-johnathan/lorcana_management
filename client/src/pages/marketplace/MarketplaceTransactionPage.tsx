import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import RequireAuth from "../../components/marketplace/RequireAuth";
import TransactionCard from "../../components/marketplace/TransactionCard";

/**
 * Singular transaction view (REQ-TX-2): a thin, deep-linkable page that renders
 * the single transaction from `GET /marketplace/transactions/:id` by reusing the
 * existing `TransactionCard` (which self-fetches and renders the card, status,
 * counterpart, and role-aware confirm/cancel/adjust/review actions). No new
 * fetch and no duplicated logic — loading, empty/error (404/403), and actions
 * all surface through TransactionCard.
 */
export default function MarketplaceTransactionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  return (
    <RequireAuth>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <Link
          to="/marketplace/transactions"
          className="text-sm text-gray-400 hover:text-amber-300"
        >
          ← All transactions
        </Link>
        {user && id ? (
          <TransactionCard transactionId={id} currentUserId={user.id} />
        ) : (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
            Transaction not found
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
