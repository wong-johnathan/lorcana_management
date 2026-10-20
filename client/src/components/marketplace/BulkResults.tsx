import { Link } from "react-router-dom";
import type { Card } from "../../types";
import type { BulkSkip } from "../../utils/bulkListing";
import BulkListingSkipList from "./BulkListingSkipList";

export interface BulkFailedRow {
  card: Card;
  /** The server's message, verbatim (AC-BULK-7.4). */
  error: string;
}

interface BulkResultsProps {
  created: number;
  /** Client-side preview skips + server-side `skipped` outcomes. */
  skippedCount: number;
  failed: BulkFailedRow[];
  /** Preview skips, repeated read-only (RS-7). */
  skipped: BulkSkip[];
  /** A 401 stopped the run: retry is blocked until the seller signs in (S23). */
  sessionExpired: boolean;
  onRetry: () => void;
  onDone: () => void;
}

const SESSION_EXPIRED_MESSAGE =
  "Your session expired. Sign in again to retry the failed cards.";

/**
 * Results panel (REQ-BULK-7.5/7.6, UI C-17..C-19): headline counts (zero
 * counters omitted), the failed cards with their verbatim server messages,
 * Retry failed (only when something failed) and Done.
 */
export default function BulkResults({
  created,
  skippedCount,
  failed,
  skipped,
  sessionExpired,
  onRetry,
  onDone,
}: BulkResultsProps) {
  return (
    <div className="space-y-3">
      <p className="text-lg font-semibold tabular-nums text-gray-100" data-testid="bulk-results-summary">
        <span className={created > 0 ? "text-emerald-300" : "text-gray-100"}>
          {`${created} listings created`}
        </span>
        {skippedCount > 0 ? (
          <>
            <span className="text-gray-500"> · </span>
            <span className="font-normal text-gray-300">
              <span className="font-semibold tabular-nums">{skippedCount}</span> skipped
            </span>
          </>
        ) : null}
        {failed.length > 0 ? (
          <>
            <span className="text-gray-500"> · </span>
            <span className="font-normal text-gray-300">
              <span className="font-semibold tabular-nums">{failed.length}</span> failed
            </span>
          </>
        ) : null}
      </p>

      {sessionExpired ? (
        <div
          id="bulk-session-expired"
          role="alert"
          className="rounded-xl border border-red-800/60 bg-red-950/20 p-3 text-sm text-red-200"
        >
          {SESSION_EXPIRED_MESSAGE}{" "}
          <Link
            to="/login"
            className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
          >
            Sign in
          </Link>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Failed ({failed.length})
          </h3>
          <ul className="mt-2 rounded-xl border border-red-800/60 bg-red-950/10">
            {failed.map((row) => {
              const meta = [row.card.setName, row.card.cardNumber].filter(Boolean).join(" · ");
              return (
                <li
                  key={row.card.id}
                  className="border-l-2 border-red-800/60 px-3 py-2 lg:flex lg:items-baseline lg:justify-between lg:gap-4"
                >
                  <span className="text-sm">
                    <span className="font-medium text-gray-100">{row.card.name}</span>
                    {meta ? <span className="text-xs text-gray-400"> · {meta}</span> : null}
                  </span>
                  <span className="break-words text-sm text-red-300">{row.error}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-gray-400">
            These cards were not listed. You can retry them, or list them one at a time with
            Create listing.
          </p>
        </div>
      ) : null}

      <BulkListingSkipList skipped={skipped} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {failed.length > 0 ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={sessionExpired}
            aria-describedby={sessionExpired ? "bulk-session-expired" : undefined}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 tabular-nums hover:border-gray-500 disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-400 disabled:hover:border-gray-800"
          >
            {`Retry failed (${failed.length})`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDone}
          className="ml-auto rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400"
        >
          Done — view your listings
        </button>
      </div>
    </div>
  );
}
