import type { BulkSkip } from "../../utils/bulkListing";

/**
 * "Not included (k)" (REQ-BULK-6.2, UI C-14): every card the app left out of
 * the batch, with one fixed reason. Omitted entirely when nothing is skipped,
 * and never contains rows the seller removed themselves (DD-13).
 */
export default function BulkListingSkipList({ skipped }: { skipped: BulkSkip[] }) {
  if (skipped.length === 0) return null;

  return (
    <div>
      <h3 className="mt-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
        Not included ({skipped.length})
      </h3>
      <ul className="mt-2 divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-950/30">
        {skipped.map((skip) => {
          const meta = [skip.card.setName, skip.card.cardNumber].filter(Boolean).join(" · ");
          return (
            <li
              key={skip.card.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm text-gray-300"
            >
              <span className="min-w-0">
                <span className="font-medium text-gray-100">{skip.card.name}</span>
                {meta ? <span className="text-xs text-gray-400"> · {meta}</span> : null}
              </span>
              <span className="text-sm text-gray-300">
                <span className="text-gray-500">— </span>
                {skip.reason}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
