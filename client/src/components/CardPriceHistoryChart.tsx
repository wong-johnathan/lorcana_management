import { useEffect, useMemo, useState } from "react";
import { cards as cardsApi } from "../services/api";
import type { CardPriceHistory } from "../types";

const PRICE_FIELDS = [
  { value: "marketPrice", label: "Market" },
  { value: "lowPrice", label: "Low" },
  { value: "midPrice", label: "Mid" },
  { value: "highPrice", label: "High" },
  { value: "directLowPrice", label: "Direct Low" },
] as const;

const STANDARD_RANGES = [30, 90, 365] as const;
/** Backend caps `days` at 730; used as the "All" option meaning "everything stored". */
const ALL_RANGE = 730;

type PriceField = (typeof PRICE_FIELDS)[number]["value"];

export function rangeLabel(days: number): string {
  if (days === ALL_RANGE) return "All";
  if (days === 365) return "1Y";
  return `${days}D`;
}

/**
 * Ranges we are willing to offer for a card.
 *
 * A button for a window the card has no history for would always draw the same
 * short series, so hide it. `All` stands in for "more than the largest standard
 * window you cannot fill"; with very little history it is the only option.
 */
export function priceRangeOptions(availableDays: number | null | undefined): number[] {
  if (availableDays == null) return [...STANDARD_RANGES];
  const options: number[] = STANDARD_RANGES.filter((range) => range <= availableDays);
  if (availableDays < 365) options.push(ALL_RANGE);
  return options.length > 0 ? options : [ALL_RANGE];
}

interface CardPriceHistoryChartProps {
  cardId: string;
  variants: string[];
}

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
}

function changeText(summary: CardPriceHistory["summary"]): string {
  if (summary.changeAmount == null || summary.changePercent == null) return "—";
  const amountPrefix = summary.changeAmount > 0 ? "+" : "";
  const percentPrefix = summary.changePercent > 0 ? "+" : "";
  return `${amountPrefix}${money(summary.changeAmount)} / ${percentPrefix}${summary.changePercent.toFixed(2)}%`;
}

function emptyCopy(reason?: CardPriceHistory["emptyReason"]): { title: string; body: string } {
  if (reason === "NO_TCGPLAYER_ID") {
    return {
      title: "No TCGPlayer ID yet",
      body: "Price history will appear once LorcanaJSON maps this card to TCGPlayer.",
    };
  }
  if (reason === "NO_VARIANT_HISTORY") {
    return { title: "No history for this variant", body: "Try another variant or wait for the next price sync." };
  }
  return { title: "No price history yet", body: "Run Sync Prices once to capture the first snapshot." };
}

function chartPath(points: CardPriceHistory["points"]): string {
  const priced = points.filter((point) => point.price != null) as Array<CardPriceHistory["points"][number] & { price: number }>;
  if (priced.length === 0) return "";
  const min = Math.min(...priced.map((point) => point.price));
  const max = Math.max(...priced.map((point) => point.price));
  const span = max - min || 1;
  return priced.map((point, index) => {
    const x = priced.length === 1 ? 50 : (index / (priced.length - 1)) * 100;
    const y = 90 - ((point.price - min) / span) * 80;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export default function CardPriceHistoryChart({ cardId, variants }: CardPriceHistoryChartProps) {
  const variantOptions = variants.length > 0 ? variants : ["Normal"];
  const [variant, setVariant] = useState(variantOptions[0]);
  const [field, setField] = useState<PriceField>("marketPrice");
  const [days, setDays] = useState<number>(90);
  const [history, setHistory] = useState<CardPriceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    cardsApi.priceHistory(cardId, { variant, field, days })
      .then((data) => { if (active) setHistory(data); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Failed to load price history"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cardId, variant, field, days]);

  const path = useMemo(() => chartPath(history?.points ?? []), [history]);
  const empty = history && history.points.length === 0 ? emptyCopy(history.emptyReason) : null;
  const rangeOptions = useMemo(() => priceRangeOptions(history?.availableDays), [history]);

  // Keep the selected window inside the options this card can actually support.
  useEffect(() => {
    if (!rangeOptions.includes(days)) setDays(rangeOptions[rangeOptions.length - 1]);
  }, [rangeOptions, days]);

  return (
    <section className="rounded-lg border border-gray-800 bg-gray-950/80 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-100">Price history</h3>
        {!empty && (
          <div className="flex gap-1">
            {rangeOptions.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                className={`rounded px-2 py-1 text-[11px] font-semibold ${days === range ? "bg-amber-500 text-gray-950" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
              >
                {rangeLabel(range)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-400">
          Variant
          <select aria-label="History variant" value={variant} onChange={(event) => setVariant(event.target.value)} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100">
            {variantOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-400">
          Price
          <select aria-label="History price field" value={field} onChange={(event) => setField(event.target.value as PriceField)} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100">
            {PRICE_FIELDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading price history…</p>
      ) : error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : empty ? (
        <div className="rounded border border-gray-800 bg-gray-900 p-3">
          <p className="text-sm font-semibold text-gray-200">{empty.title}</p>
          <p className="mt-1 text-xs text-gray-500">{empty.body}</p>
        </div>
      ) : history ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><p className="text-gray-500">Current</p><p className="font-semibold text-gray-100">{money(history.summary.current)}</p></div>
            <div><p className="text-gray-500">Low / High</p><p className="font-semibold text-gray-100">{money(history.summary.low)} / {money(history.summary.high)}</p></div>
            <div><p className="text-gray-500">Change ({rangeLabel(days)})</p><p className={history.summary.changeAmount != null && history.summary.changeAmount >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>{changeText(history.summary)}</p></div>
          </div>
          <svg aria-label="Price history chart" viewBox="0 0 100 100" className="h-28 w-full rounded bg-gray-900" preserveAspectRatio="none">
            <path d={path} fill="none" stroke="rgb(251 191 36)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
        </>
      ) : null}
    </section>
  );
}
