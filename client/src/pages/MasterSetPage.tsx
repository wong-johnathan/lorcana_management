import { useEffect, useMemo, useState } from "react";
import { cards as cardsApi } from "../services/api";
import type { Card, FilterOptions, MasterSetEstimate, MasterSetPriceField } from "../types";
import CardDetail from "../components/CardDetail";
import CardGrid from "../components/CardGrid";

const VARIANTS = ["Normal", "Foil"];
const PRICE_FIELDS: { value: MasterSetPriceField; label: string }[] = [
  { value: "marketPrice", label: "Market price" },
  { value: "lowPrice", label: "Low price" },
  { value: "midPrice", label: "Mid price" },
  { value: "highPrice", label: "High price" },
];

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Super Rare", "Legendary", "Enchanted", "Special", "Iconic"];
const VARIANT_ALIASES: Record<string, string[]> = {
  Foil: ["Foil", "Cold Foil", "Holofoil"],
};

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function sortRarities(rarities: string[]): string[] {
  return [...rarities].sort((a, b) => {
    const ai = RARITY_ORDER.indexOf(a);
    const bi = RARITY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function reasonLabel(reason: string): string {
  if (reason === "no_tcgplayer_id") return "No TCGPlayer ID";
  if (reason === "no_price_for_variant") return "No price for variant";
  if (reason === "null_price") return "Missing selected price";
  return reason;
}

interface DrilldownModalState {
  title: string;
  cards: Card[];
  total: number;
  loading: boolean;
  error: string | null;
  priceContext?: {
    variant: string;
    priceField: MasterSetPriceField;
    status?: string;
  };
}

function compactParams(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

function actionButtonClass(tone: "default" | "danger" = "default"): string {
  return tone === "danger"
    ? "inline-flex items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-200 hover:bg-red-500/20"
    : "inline-flex items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-200 hover:bg-sky-500/20";
}

async function fetchAllCards(params: Record<string, string>): Promise<{ cards: Card[]; total: number }> {
  const cards: Card[] = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;

  do {
    const response = await cardsApi.list({ ...params, page: String(page), limit: "100" });
    cards.push(...response.cards);
    total = response.pagination.total;
    totalPages = response.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return { cards, total };
}

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const raw = String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function safeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "master-set";
}

function priceForVariant(card: Card, variant: string, field: MasterSetPriceField): { matchedVariant: string; value: number | null } {
  const variants = VARIANT_ALIASES[variant] ?? [variant];
  for (const candidate of variants) {
    const price = card.prices.find((item) => item.variant.toLowerCase() === candidate.toLowerCase());
    if (price) return { matchedVariant: price.variant, value: price[field] };
  }
  return { matchedVariant: "", value: null };
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface CsvExportOptions {
  title: string;
  cards: Card[];
  variants: string[];
  priceField: MasterSetPriceField;
  priceContext?: DrilldownModalState["priceContext"];
}

function exportCardsCsv({ title, cards, variants, priceField, priceContext }: CsvExportOptions) {
  const exportVariants = priceContext ? [priceContext.variant] : variants;
  const rows: Array<Array<string | number | null | undefined>> = [
    [
      "Set Name",
      "Set Code",
      "Card Number",
      "Name",
      "Subtitle",
      "Rarity",
      "Color",
      "Card Type",
      "Ink Cost",
      "Variant",
      "Matched Price Variant",
      "Price Field",
      "Price",
      "Price Status",
      "TCGPlayer ID",
      "Image URL",
    ],
  ];

  for (const card of cards) {
    for (const variant of exportVariants) {
      const price = priceForVariant(card, variant, priceField);
      rows.push([
        card.setName,
        card.setCode,
        card.cardNumber,
        card.name,
        card.subtitle,
        card.rarity,
        card.color,
        card.cardType,
        card.inkCost,
        variant,
        price.matchedVariant,
        priceField,
        price.value,
        price.value == null ? "Missing" : "Priced",
        card.tcgPlayerId,
        card.imageUrl,
      ]);
    }
  }

  downloadCsv(`${safeFilename(title)}.csv`, rows);
}

export default function MasterSetPage() {
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [setName, setSetName] = useState("");
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>(["Normal", "Foil"]);
  const [priceField, setPriceField] = useState<MasterSetPriceField>("marketPrice");
  const [estimate, setEstimate] = useState<MasterSetEstimate | null>(null);
  const [drilldown, setDrilldown] = useState<DrilldownModalState | null>(null);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rarities = useMemo(() => sortRarities(filters?.rarities ?? []), [filters]);

  useEffect(() => {
    cardsApi.filters()
      .then((data) => {
        setFilters(data);
        setSetName(data.sets.at(-1) ?? "");
        setSelectedRarities(sortRarities(data.rarities));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load filters"));
  }, []);

  const toggleRarity = (rarity: string) => {
    setSelectedRarities((prev) =>
      prev.includes(rarity) ? prev.filter((r) => r !== rarity) : sortRarities([...prev, rarity])
    );
  };

  const toggleVariant = (variant: string) => {
    setSelectedVariants((prev) =>
      prev.includes(variant) ? prev.filter((v) => v !== variant) : [...prev, variant]
    );
  };

  const applyPreset = (preset: "all" | "common" | "common-uncommon" | "no-enchanted" | "high") => {
    if (!rarities.length) return;
    if (preset === "all") setSelectedRarities(rarities);
    if (preset === "common") setSelectedRarities(rarities.filter((r) => r === "Common"));
    if (preset === "common-uncommon") setSelectedRarities(rarities.filter((r) => ["Common", "Uncommon"].includes(r)));
    if (preset === "no-enchanted") setSelectedRarities(rarities.filter((r) => r !== "Enchanted"));
    if (preset === "high") setSelectedRarities(rarities.filter((r) => ["Rare", "Super Rare", "Legendary", "Enchanted"].includes(r)));
  };

  const calculate = async () => {
    if (!setName) {
      setError("Select a set first");
      return;
    }
    if (selectedRarities.length === 0) {
      setError("Select at least one rarity");
      return;
    }
    if (selectedVariants.length === 0) {
      setError("Select at least one printing");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await cardsApi.masterSetEstimate({
        setName,
        rarities: selectedRarities.join(","),
        variants: selectedVariants.join(","),
        priceField,
      });
      setEstimate(result);
    } catch (err) {
      setEstimate(null);
      setError(err instanceof Error ? err.message : "Failed to calculate master set cost");
    } finally {
      setLoading(false);
    }
  };

  const buildDrilldownParams = (
    extra: Record<string, string | undefined>,
    includeAllRarities = true
  ) => compactParams({
    set: estimate?.setName ?? setName,
    rarity: includeAllRarities ? estimate?.selectedRarities.join(",") : undefined,
    priceField,
    ...extra,
  });

  const openDrilldown = async (
    title: string,
    extra: Record<string, string | undefined>,
    includeAllRarities = true
  ) => {
    const params = buildDrilldownParams(extra, includeAllRarities);
    const priceContext = params.priceVariant
      ? {
          variant: params.priceVariant,
          priceField: (params.priceField || "marketPrice") as MasterSetPriceField,
          status: params.priceStatus,
        }
      : undefined;

    setDrilldown({ title, cards: [], total: 0, loading: true, error: null, priceContext });
    try {
      const result = await fetchAllCards(params);
      setDrilldown((current) =>
        current ? { ...current, cards: result.cards, total: result.total, loading: false } : current
      );
    } catch (err) {
      setDrilldown((current) =>
        current
          ? {
              ...current,
              loading: false,
              error: err instanceof Error ? err.message : "Failed to load cards",
            }
          : current
      );
    }
  };

  const openCardDetail = async (cardId: string) => {
    try {
      setDetailCard(await cardsApi.get(cardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load card detail");
    }
  };

  const exportEstimateCsv = async () => {
    if (!estimate) return;
    setCsvLoading(true);
    setError(null);
    try {
      const result = await fetchAllCards(buildDrilldownParams({}));
      exportCardsCsv({
        title: `${estimate.setName} master set`,
        cards: result.cards,
        variants: estimate.selectedVariants,
        priceField: estimate.priceField,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setCsvLoading(false);
    }
  };

  const exportDrilldownCsv = () => {
    if (!drilldown || drilldown.loading || drilldown.error) return;
    exportCardsCsv({
      title: drilldown.title,
      cards: drilldown.cards,
      variants: estimate?.selectedVariants ?? selectedVariants,
      priceField: drilldown.priceContext?.priceField ?? estimate?.priceField ?? priceField,
      priceContext: drilldown.priceContext,
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-400">Master Set Calculator</h1>
        <p className="text-sm text-gray-400 mt-1">
          Estimate the cost of a full set by rarity, printing, and TCGPlayer price basis.
        </p>
      </div>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-gray-300">Set</span>
            <select
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {(filters?.sets ?? []).map((set) => (
                <option key={set} value={set}>{set}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-medium text-gray-300">Price basis</span>
            <select
              value={priceField}
              onChange={(e) => setPriceField(e.target.value as MasterSetPriceField)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {PRICE_FIELDS.map((field) => (
                <option key={field.value} value={field.value}>{field.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-300 mr-1">Rarities</span>
            <button type="button" onClick={() => applyPreset("all")} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">All</button>
            <button type="button" onClick={() => applyPreset("common")} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">Common only</button>
            <button type="button" onClick={() => applyPreset("common-uncommon")} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">Common + Uncommon</button>
            <button type="button" onClick={() => applyPreset("no-enchanted")} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">Exclude Enchanted</button>
            <button type="button" onClick={() => applyPreset("high")} className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">High rarity</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {rarities.map((rarity) => {
              const active = selectedRarities.includes(rarity);
              return (
                <button
                  key={rarity}
                  type="button"
                  onClick={() => toggleRarity(rarity)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    active
                      ? "border-amber-500 bg-amber-500/20 text-amber-200"
                      : "border-gray-700 bg-gray-950 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {rarity}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-gray-300">Printings</span>
          <div className="flex flex-wrap gap-2">
            {VARIANTS.map((variant) => {
              const active = selectedVariants.includes(variant);
              return (
                <button
                  key={variant}
                  type="button"
                  onClick={() => toggleVariant(variant)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    active
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                      : "border-gray-700 bg-gray-950 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {variant}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={calculate}
            disabled={loading || !filters}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-400 text-black font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            {loading ? "Calculating…" : "Calculate master set"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </section>

      {estimate && (
        <section className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Known total</p>
              <p className="text-3xl font-bold text-emerald-400 mt-1">{currency(estimate.total)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Cards selected</p>
              <p className="text-2xl font-semibold mt-1">{estimate.cardCount}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Variants priced</p>
              <p className="text-2xl font-semibold mt-1 text-sky-300">{estimate.pricedVariantCount}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Missing prices</p>
              <p className={`text-2xl font-semibold mt-1 ${estimate.missingVariantCount ? "text-red-300" : "text-emerald-300"}`}>
                {estimate.missingVariantCount}
              </p>
            </div>
          </div>

          {estimate.missingVariantCount > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Estimate is incomplete: missing prices are excluded from the total, not treated as $0.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
            <span className="text-sm text-sky-100">Inspect the cards behind this estimate:</span>
            <button
              type="button"
              onClick={() => openDrilldown("Selected master-set cards", {})}
              className={actionButtonClass()}
            >
              View selected cards
            </button>
            <button
              type="button"
              onClick={exportEstimateCsv}
              disabled={csvLoading}
              className="inline-flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {csvLoading ? "Exporting…" : "Export CSV"}
            </button>
            {estimate.breakdownByVariant.filter((row) => row.missingCount > 0).map((row) => (
              <button
                key={`missing-${row.variant}`}
                type="button"
                onClick={() => openDrilldown(`Missing ${row.variant} prices`, { priceVariant: row.variant, priceStatus: "missing" })}
                className={actionButtonClass("danger")}
              >
                Missing {row.variant} prices
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 font-semibold">Breakdown by rarity</div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2">Rarity</th>
                    <th className="text-right px-4 py-2">Cards</th>
                    <th className="text-right px-4 py-2">Missing</th>
                    <th className="text-right px-4 py-2">Total</th>
                    <th className="text-right px-4 py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.breakdownByRarity.map((row) => (
                    <tr key={row.rarity} className="border-t border-gray-800">
                      <td className="px-4 py-2 text-gray-300">{row.rarity}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{row.cardCount}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{row.missingVariantCount}</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-300">{currency(row.total)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openDrilldown(`${row.rarity} cards`, { rarity: row.rarity }, false)}
                          className={actionButtonClass()}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 font-semibold">Breakdown by printing</div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2">Printing</th>
                    <th className="text-right px-4 py-2">Priced</th>
                    <th className="text-right px-4 py-2">Missing</th>
                    <th className="text-right px-4 py-2">Total</th>
                    <th className="text-right px-4 py-2">View</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.breakdownByVariant.map((row) => (
                    <tr key={row.variant} className="border-t border-gray-800">
                      <td className="px-4 py-2 text-gray-300">{row.variant}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{row.pricedCount}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{row.missingCount}</td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-300">{currency(row.total)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {row.pricedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => openDrilldown(`Priced ${row.variant} cards`, { priceVariant: row.variant, priceStatus: "priced" })}
                              className={actionButtonClass()}
                            >
                              Priced
                            </button>
                          )}
                          {row.missingCount > 0 && (
                            <button
                              type="button"
                              onClick={() => openDrilldown(`Missing ${row.variant} prices`, { priceVariant: row.variant, priceStatus: "missing" })}
                              className={actionButtonClass("danger")}
                            >
                              Missing
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {estimate.missing.length > 0 && (
            <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <summary className="cursor-pointer px-4 py-3 font-semibold text-red-200">
                Missing price details ({estimate.missing.length})
              </summary>
              <div className="max-h-96 overflow-auto border-t border-gray-800">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-gray-500 sticky top-0 bg-gray-900">
                    <tr>
                      <th className="text-left px-4 py-2">Card</th>
                      <th className="text-left px-4 py-2">Rarity</th>
                      <th className="text-left px-4 py-2">Printing</th>
                      <th className="text-left px-4 py-2">Reason</th>
                      <th className="text-right px-4 py-2">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.missing.map((item) => (
                      <tr key={`${item.cardId}-${item.variant}`} className="border-t border-gray-800">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-200">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            {item.subtitle ? `${item.subtitle} · ` : ""}{item.cardNumber}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-400">{item.rarity}</td>
                        <td className="px-4 py-2 text-gray-400">{item.variant}</td>
                        <td className="px-4 py-2 text-gray-400">{reasonLabel(item.reason)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => openCardDetail(item.cardId)}
                            className={actionButtonClass("danger")}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>
      )}
      {drilldown && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3"
          onClick={() => setDrilldown(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-amber-300">{drilldown.title}</h2>
                <p className="text-xs text-gray-400">
                  {drilldown.loading
                    ? "Loading cards…"
                    : `${drilldown.cards.length}${drilldown.total !== drilldown.cards.length ? ` of ${drilldown.total}` : ""} cards`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!drilldown.loading && !drilldown.error && drilldown.cards.length > 0 && (
                  <button
                    type="button"
                    onClick={exportDrilldownCsv}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                  >
                    Export CSV
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrilldown(null)}
                  className="text-2xl leading-none text-gray-400 hover:text-white"
                  aria-label="Close card list"
                >
                  &times;
                </button>
              </div>
            </div>

            {drilldown.error ? (
              <div className="p-6 text-sm text-red-300">{drilldown.error}</div>
            ) : drilldown.loading ? (
              <div className="p-10 text-center text-gray-400">Loading cards…</div>
            ) : (
              <div className="overflow-y-auto">
                <CardGrid
                  cards={drilldown.cards}
                  onSelect={setDetailCard}
                  priceContext={drilldown.priceContext}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {detailCard && (
        <CardDetail
          card={detailCard}
          onClose={() => setDetailCard(null)}
        />
      )}
    </div>
  );
}
