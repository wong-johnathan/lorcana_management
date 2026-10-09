import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cards as cardsApi } from "../services/api";
import type { PriceMoverField, PriceMoverType, PriceMoverWindow, PriceMoversResponse } from "../types";
import { cardImageUrl } from "../utils/cardImages";

const MOVER_TYPES: Array<{ value: PriceMoverType; label: string; helper: string }> = [
  { value: "gainers", label: "Top gainers", helper: "Highest positive % move" },
  { value: "losers", label: "Top losers", helper: "Largest negative % move" },
  { value: "volatile", label: "Most volatile", helper: "Biggest move either way" },
  { value: "dollars", label: "Biggest $ moves", helper: "Largest absolute dollar change" },
];

const WINDOWS: Array<{ value: PriceMoverWindow; label: string }> = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

const FIELDS: Array<{ value: PriceMoverField; label: string }> = [
  { value: "marketPrice", label: "Market" },
  { value: "lowPrice", label: "Low" },
  { value: "midPrice", label: "Mid" },
  { value: "highPrice", label: "High" },
  { value: "directLowPrice", label: "Direct Low" },
];

const VARIANTS = ["Normal", "Cold Foil", "Holofoil", "all"];
const RARITIES = ["all", "Common", "Uncommon", "Rare", "Super Rare", "Legendary", "Enchanted", "Epic", "Iconic", "Promo", "Special"];

function money(value: number): string {
  return value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
}

function signedMoney(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${money(value)}`;
}

function percent(value: number | null): string {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function emptyCopy(reason?: PriceMoversResponse["emptyReason"]): string {
  if (reason === "NO_COMPLETED_RUNS") return "No completed price snapshots yet. Run Sync Prices to capture market history.";
  if (reason === "NO_COMPARISON_RUN") return "There is no older snapshot for this range yet. Try 24H or wait for more daily snapshots.";
  return "No price movers found for this selection.";
}

export default function PriceMoversPage() {
  const [type, setType] = useState<PriceMoverType>("gainers");
  const [windowRange, setWindowRange] = useState<PriceMoverWindow>("24h");
  const [variant, setVariant] = useState("Normal");
  const [rarity, setRarity] = useState("all");
  const [field, setField] = useState<PriceMoverField>("marketPrice");
  const [data, setData] = useState<PriceMoversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    cardsApi.priceMovers({ window: windowRange, type, variant, rarity, field, limit: 50 })
      .then((response) => { if (active) setData(response); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Failed to load price movers"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [windowRange, type, variant, rarity, field]);

  const activeType = useMemo(() => MOVER_TYPES.find((item) => item.value === type) ?? MOVER_TYPES[0], [type]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-amber-400">TCGCSV market movement</p>
        <h1 className="text-2xl font-bold text-gray-100">Price Movers</h1>
        <p className="mt-1 text-sm text-gray-400">
          Phase 1 global view: rank cards by movement between the latest completed snapshot and the selected historical window.
        </p>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-xs text-gray-400">
            Window
            <select value={windowRange} onChange={(event) => setWindowRange(event.target.value as PriceMoverWindow)} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100">
              {WINDOWS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Variant
            <select value={variant} onChange={(event) => setVariant(event.target.value)} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100">
              {VARIANTS.map((option) => <option key={option} value={option}>{option === "all" ? "All variants" : option}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Rarity
            <select value={rarity} onChange={(event) => setRarity(event.target.value)} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100">
              {RARITIES.map((option) => <option key={option} value={option}>{option === "all" ? "All rarities" : option}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-400">
            Price field
            <select value={field} onChange={(event) => setField(event.target.value as PriceMoverField)} className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100">
              {FIELDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
            <p className="text-xs text-gray-500">Mode</p>
            <p className="text-sm font-semibold text-gray-100">{activeType.label}</p>
            <p className="text-xs text-gray-500">{activeType.helper}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {MOVER_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${type === option.value ? "bg-amber-500 text-gray-950" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">Loading price movers…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">{emptyCopy(data?.emptyReason)}</div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-gray-500">
            Comparing {data.previousSourceUpdatedAt ? new Date(data.previousSourceUpdatedAt).toLocaleString() : "previous snapshot"} → {data.currentSourceUpdatedAt ? new Date(data.currentSourceUpdatedAt).toLocaleString() : "latest snapshot"}
          </div>
          {data.items.map((item, index) => {
            const positive = item.changeAmount > 0;
            return (
              <article key={`${item.card.id}-${item.variant}`} className="flex gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                <div className="w-12 shrink-0 text-center text-lg font-bold text-gray-500">#{index + 1}</div>
                {item.card.imageUrl ? (
                  <img src={cardImageUrl(item.card)} alt={item.card.name} className="h-24 w-16 rounded object-cover" />
                ) : (
                  <div className="h-24 w-16 rounded bg-gray-800" />
                )}
                <div className="min-w-0 flex-1">
                  <Link to={`/database/${item.card.id}`} aria-label={`View ${item.card.name}`} className="font-semibold text-gray-100 hover:text-amber-300">
                    {item.card.name}
                  </Link>
                  {item.card.subtitle && <p className="truncate text-sm text-gray-400">{item.card.subtitle}</p>}
                  <p className="mt-1 text-xs text-gray-500">{item.card.setName} · {item.card.rarity} · {item.variant}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><p className="text-gray-500">Previous</p><p className="font-semibold text-gray-200">{money(item.previousPrice)}</p></div>
                    <div><p className="text-gray-500">Current</p><p className="font-semibold text-gray-200">{money(item.currentPrice)}</p></div>
                    <div><p className="text-gray-500">Change</p><p className={`font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>{signedMoney(item.changeAmount)}</p></div>
                    <div><p className="text-gray-500">Percent</p><p className={`font-semibold ${positive ? "text-emerald-300" : "text-red-300"}`}>{percent(item.changePercent)}</p></div>
                  </div>
                </div>
                <div className={`hidden self-center rounded-full px-3 py-1 text-sm font-bold sm:block ${positive ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
                  {signedMoney(item.changeAmount)} / {percent(item.changePercent)}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
