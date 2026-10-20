import type { BulkCandidate } from "../../utils/bulkListing";
import { formatPriceMinor } from "../../utils/marketplaceParams";

interface BulkListingTableProps {
  /** Every match row, in grid order (the order never changes while deselecting). */
  candidates: BulkCandidate[];
  /** cardIds currently included in the batch. */
  included: Set<string>;
  onToggle: (cardId: string, include: boolean) => void;
  /** Undefined when the typed price is empty/invalid → money cells show an em dash. */
  priceMinor?: number;
  currency: string;
}

const MONEY_DASH = "—";

/** Small helper so a stacked mobile row keeps its column context. */
function MobileLabel({ children }: { children: string }) {
  return <span className="mr-2 text-xs text-gray-400 sm:hidden">{children}</span>;
}

/**
 * Included-set preview table (REQ-BULK-6.1/6.4, UI C-11/C-12).
 *
 * A real `<table>` with a `sr-only` caption, `th scope="col"` headers and the
 * card name as the row header. Below `sm` the same rows stack (display:block)
 * so the 320 px layout never scrolls the page, while the table semantics and a
 * single checkbox per row are preserved in the DOM.
 */
export default function BulkListingTable({
  candidates,
  included,
  onToggle,
  priceMinor,
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
        <caption className="sr-only">Listings to create ({included.size})</caption>
        <thead className="hidden bg-gray-900 sm:table-header-group">
          <tr className="border-b border-gray-800">
            <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Include
            </th>
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
            const isIncluded = included.has(card.id);
            const unitPrice =
              priceMinor === undefined ? MONEY_DASH : formatPriceMinor(priceMinor, currency);
            const lineTotal =
              priceMinor === undefined
                ? MONEY_DASH
                : formatPriceMinor(candidate.quantity * priceMinor, currency);

            return (
              <tr
                key={card.id}
                className={`block border-b border-gray-800 last:border-0 sm:table-row ${
                  isIncluded ? "hover:bg-gray-900/40" : "bg-gray-950/40"
                }`}
              >
                <td className="block px-3 pt-2 sm:table-cell sm:w-14 sm:py-2">
                  <label className="-m-2 inline-flex min-h-11 min-w-11 cursor-pointer items-center p-2 sm:min-h-0 sm:min-w-0">
                    <input
                      type="checkbox"
                      checked={isIncluded}
                      onChange={(event) => onToggle(card.id, event.target.checked)}
                      className="h-[18px] w-[18px] rounded accent-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                    />
                    <span className="sr-only">
                      {`Include ${card.name} · ${card.setName} · ${card.cardNumber} in this batch`}
                    </span>
                  </label>
                </td>
                <th
                  scope="row"
                  className={`block px-3 pb-1 text-left font-normal sm:table-cell sm:py-2 ${
                    isIncluded ? "text-gray-100" : "text-gray-300"
                  }`}
                >
                  <span className="block text-sm font-semibold">{card.name}</span>
                  {card.subtitle ? (
                    <span className="block text-xs text-gray-400">{card.subtitle}</span>
                  ) : null}
                  <span className="block text-xs text-gray-400 sm:hidden">
                    {[card.setName, card.cardNumber].filter(Boolean).join(" · ")}
                  </span>
                  {!isIncluded ? (
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-block rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300"
                    >
                      Removed from this batch
                    </span>
                  ) : null}
                </th>
                <td className="hidden px-3 py-2 text-xs text-gray-400 sm:table-cell">
                  {[card.setName, card.cardNumber].filter(Boolean).join(" · ")}
                </td>
                <td className="block px-3 py-0.5 text-sm sm:table-cell sm:py-2">
                  <MobileLabel>Rarity</MobileLabel>
                  <span className={isIncluded ? "text-gray-300" : "text-gray-400"}>{card.rarity}</span>
                </td>
                <td className="block px-3 py-0.5 text-sm sm:table-cell sm:py-2">
                  <MobileLabel>Variant</MobileLabel>
                  <span className={isIncluded ? "text-gray-300" : "text-gray-400"}>Normal</span>
                </td>
                <td className="block px-3 py-0.5 text-right text-sm tabular-nums sm:table-cell sm:py-2">
                  <MobileLabel>Copies</MobileLabel>
                  <span className={isIncluded ? "text-gray-100" : "text-gray-400"}>
                    {isIncluded ? candidate.quantity : MONEY_DASH}
                  </span>
                  {isIncluded && candidate.capped ? (
                    <span className="block text-[10px] text-amber-300">{`capped from ${candidate.normalSpare} spares`}</span>
                  ) : null}
                </td>
                <td className="block px-3 py-0.5 text-right text-sm tabular-nums sm:table-cell sm:py-2">
                  <MobileLabel>Unit price</MobileLabel>
                  <span className={isIncluded ? "text-gray-100" : "text-gray-400"}>
                    {isIncluded ? unitPrice : MONEY_DASH}
                  </span>
                </td>
                <td className="block px-3 pb-2 text-right text-sm tabular-nums sm:table-cell sm:py-2">
                  <MobileLabel>Line total</MobileLabel>
                  <span className={isIncluded ? "font-semibold text-gray-100" : "text-gray-400"}>
                    {isIncluded ? lineTotal : MONEY_DASH}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
