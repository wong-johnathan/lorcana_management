import type { BulkCandidate } from "../../utils/bulkListing";
import { formatPriceMinor } from "../../utils/marketplaceParams";

interface BulkListingTableProps {
  /** Every card in the batch, in grid order. */
  candidates: BulkCandidate[];
  /** Per-row unit price; undefined → money cells show an em dash. */
  priceMinorFor: (candidate: BulkCandidate) => number | undefined;
  currency: string;
}

const MONEY_DASH = "—";

/** Small helper so a stacked mobile row keeps its column context. */
function MobileLabel({ children }: { children: string }) {
  return <span className="mr-2 text-xs text-gray-400 sm:hidden">{children}</span>;
}

/**
 * Batch preview table (REQ-BULK-6.1/6.4, UI C-11/C-12).
 *
 * The batch is the filtered set, so every row is listed: there is no per-row
 * include toggle anymore. A real `<table>` with an `sr-only` caption,
 * `th scope="col"` headers and the card name as the row header. Below `sm` the
 * same rows stack (display:block) so the 320 px layout never scrolls the page.
 */
export default function BulkListingTable({
  candidates,
  priceMinorFor,
  currency,
}: BulkListingTableProps) {
  return (
    <div
      role="region"
      aria-label="Listings to create"
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
    >
      <table className="w-full text-left text-sm text-gray-300">
        <caption className="sr-only">Listings to create ({candidates.length})</caption>
        <thead className="hidden bg-gray-900 sm:table-header-group">
          <tr className="border-b border-gray-800">
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Card
            </th>
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Set · number
            </th>
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Rarity
            </th>
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Variant
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Copies
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Unit price
            </th>
            <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Line total
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => {
            const card = candidate.card;
            const rowPriceMinor = priceMinorFor(candidate);
            const unitPrice =
              rowPriceMinor === undefined ? MONEY_DASH : formatPriceMinor(rowPriceMinor, currency);
            const lineTotal =
              rowPriceMinor === undefined
                ? MONEY_DASH
                : formatPriceMinor(candidate.quantity * rowPriceMinor, currency);

            return (
              <tr
                key={card.id}
                className="block border-b border-gray-800 last:border-0 hover:bg-gray-900/40 sm:table-row"
              >
                <th
                  scope="row"
                  className="block px-3 pb-1 text-left font-normal text-gray-100 sm:table-cell sm:py-2"
                >
                  <span className="block text-sm font-semibold">{card.name}</span>
                  {card.subtitle ? (
                    <span className="block text-xs text-gray-400">{card.subtitle}</span>
                  ) : null}
                  <span className="block text-xs text-gray-400 sm:hidden">
                    {[card.setName, card.cardNumber].filter(Boolean).join(" · ")}
                  </span>
                </th>
                <td className="hidden px-3 py-2 text-xs text-gray-400 sm:table-cell">
                  {[card.setName, card.cardNumber].filter(Boolean).join(" · ")}
                </td>
                <td className="block px-3 py-0.5 text-sm sm:table-cell sm:py-2">
                  <MobileLabel>Rarity</MobileLabel>
                  <span className="text-gray-300">{card.rarity}</span>
                </td>
                <td className="block px-3 py-0.5 text-sm sm:table-cell sm:py-2">
                  <MobileLabel>Variant</MobileLabel>
                  <span className="text-gray-300">Normal</span>
                </td>
                <td className="block px-3 py-0.5 text-right text-sm tabular-nums sm:table-cell sm:py-2">
                  <MobileLabel>Copies</MobileLabel>
                  <span className="text-gray-100">{candidate.quantity}</span>
                  {candidate.capped ? (
                    <span className="block text-[10px] text-amber-300">{`capped from ${candidate.normalSpare} spares`}</span>
                  ) : null}
                </td>
                <td className="block px-3 py-0.5 text-right text-sm tabular-nums sm:table-cell sm:py-2">
                  <MobileLabel>Unit price</MobileLabel>
                  <span className="text-gray-100">{unitPrice}</span>
                </td>
                <td className="block px-3 pb-2 text-right text-sm tabular-nums sm:table-cell sm:py-2">
                  <MobileLabel>Line total</MobileLabel>
                  <span className="font-semibold text-gray-100">{lineTotal}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
