import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  InventoryEntry,
  InventoryPolicy,
  MarketplaceListing,
  MarketplaceTransaction,
} from "../../types";
import { marketplace } from "../../services/api";
import CardGrid from "../CardGrid";
import FilterBar from "../FilterBar";
import {
  bulkListingCandidates,
  type BulkCandidate,
  type BulkCreateOutcome,
  type BulkSkip,
} from "../../utils/bulkListing";
import { surplusByCardId, ownedFilterOptions } from "../../utils/listingPicker";
import { totalInventoryCount, type InventoryCounts } from "../../utils/cardVariants";
import {
  MARKETPLACE_CURRENCY_OPTIONS,
  formatPriceMinor,
  priceMinorFromMajor,
} from "../../utils/marketplaceParams";
import BulkListingSkipList from "./BulkListingSkipList";
import BulkListingTable from "./BulkListingTable";
import BulkResults, { type BulkFailedRow } from "./BulkResults";
import BulkRunProgress from "./BulkRunProgress";

/** TCG market price (USD) for the normal printing, or null when absent. */
function normalTcgUsd(candidate: BulkCandidate): number | null {
  const normal = (candidate.card.prices ?? []).find(
    (price) => (price.variant ?? "").toLowerCase() === "normal"
  );
  return normal?.marketPrice ?? null;
}

/** Remembered TCG-conversion rate (1 USD → the chosen listing currency). */
const FX_RATE_KEY = "bulk-tcg-fx-rate";
const DEFAULT_FX_BY_CURRENCY: Record<string, string> = { SGD: "1.35", USD: "1" };

function defaultFxFor(currency: string): string {
  return DEFAULT_FX_BY_CURRENCY[currency] ?? "1";
}

const SESSION_EXPIRED_MESSAGE =
  "Your session expired. Sign in again to retry the failed cards.";

/**
 * UI_SPEC §2.5 (new bulk controls only, UD-10): a 2 px amber `focus-visible`
 * ring at 2 px offset on every interactive control this flow adds.
 */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950";

/** UI_SPEC §2.5: sticky-bar descendants keep the ring clear of the bar edge. */
const STICKY_RING = `scroll-mb-24 ${FOCUS_RING}`;

export type BulkPhase = "choose" | "review" | "running" | "results";

interface BulkRunRow {
  candidate: BulkCandidate;
  outcome: BulkCreateOutcome;
}

export interface BulkListingSectionProps {
  inventory: InventoryEntry[];
  policy: InventoryPolicy | null;
  /** The seller's own listings including hidden rows (`getMyListings`). */
  ownListings: MarketplaceListing[];
  /** Seller-filtered PENDING_CONFIRMATION transactions. */
  pendingTransactions: MarketplaceTransaction[];
  /** Cancel/back-to-page escape hatch before a run starts. */
  onCancel: () => void;
  /** "Done — view your listings": close the flow and return to the page. */
  onDone: () => void;
  /** The page's own `load()` — called once a run finishes (RS-5). */
  onRefresh: () => Promise<void> | void;
  /** Lets the page hide its listings grid during steps 1–2 (IA-5). */
  onPhaseChange?: (phase: BulkPhase) => void;
}

/**
 * Throttled `aria-live` text source (UX-A11Y-5/6): at most one update per
 * `intervalMs`. Intermediate updates inside the window are dropped (not
 * queued) and terminal states pass `immediate` so the summary always lands.
 */
function useAnnouncer(intervalMs = 500) {
  const [text, setText] = useState("");
  const lastAt = useRef(0);

  const announce = useCallback(
    (next: string, immediate = false) => {
      const now = Date.now();
      if (!immediate && now - lastAt.current < intervalMs) return;
      lastAt.current = now;
      setText(next);
    },
    [intervalMs]
  );

  return { text, announce };
}

function cardLabel(candidate: BulkCandidate): string {
  const { card } = candidate;
  return [card.name, card.setName, card.cardNumber].filter(Boolean).join(" · ");
}

/**
 * Bulk listing of normal-printing spares on /marketplace/sell (REQ-BULK-1..11).
 *
 * Owns one local mode — choose → review → running → results — plus the filter,
 * selection, price and currency state. Candidate maths comes from the pure
 * `bulkListingCandidates()` helper; the run is a sequential per-item loop over
 * the existing single-listing endpoint (design AD-1/§7.3).
 */
export default function BulkListingSection({
  inventory,
  policy,
  ownListings,
  pendingTransactions,
  onCancel,
  onDone,
  onRefresh,
  onPhaseChange,
}: BulkListingSectionProps) {
  const [mode, setMode] = useState<BulkPhase>("choose");
  // "Spares only" is forced on for the whole bulk flow (REQ-BULK-2.2).
  const [filters, setFilters] = useState<Record<string, string>>({ spares: "1" });
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [currency, setCurrency] = useState("SGD");
  // Price source: a flat per-copy price, or each card's TCG market price with
  // one batch-wide adjustment % plus an optional minimum-price floor.
  const [priceMode, setPriceMode] = useState<"flat" | "tcg">("flat");
  const [tcgAdjustment, setTcgAdjustment] = useState("0");
  const [minPrice, setMinPrice] = useState("");
  const [fxRate, setFxRate] = useState(() => {
    if (typeof window === "undefined") return defaultFxFor("SGD");
    return window.localStorage.getItem(FX_RATE_KEY) ?? defaultFxFor("SGD");
  });

  // Remember the chosen USD→SGD rate across runs.
  useEffect(() => {
    try {
      window.localStorage.setItem(FX_RATE_KEY, fxRate);
    } catch {
      // storage unavailable — the rate still applies for this session
    }
  }, [fxRate]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [runRows, setRunRows] = useState<BulkRunRow[]>([]);
  const [runSkips, setRunSkips] = useState<BulkSkip[]>([]);
  const [sessionExpired, setSessionExpired] = useState(false);

  const selectionLive = useAnnouncer();
  const runLive = useAnnouncer();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const restoreReviewFocusRef = useRef(false);
  const runningRef = useRef(false);

  const candidateSet = useMemo(
    () =>
      bulkListingCandidates({
        inventory,
        policy,
        ownListings,
        pendingTransactions,
        filters,
      }),
    [inventory, policy, ownListings, pendingTransactions, filters]
  );

  const options = useMemo(() => ownedFilterOptions(inventory), [inventory]);
  const surplus = useMemo(() => surplusByCardId(inventory, policy), [inventory, policy]);
  const hasOwnedCards = useMemo(
    () => inventory.some((entry) => totalInventoryCount(entry) > 0),
    [inventory]
  );
  const ownedQuantities = useMemo(() => {
    const map = new Map<string, InventoryCounts>();
    for (const entry of inventory) {
      map.set(entry.cardId, {
        quantity: entry.quantity,
        foilQuantity: entry.foilQuantity,
        holofoilQuantity: entry.holofoilQuantity,
      });
    }
    return map;
  }, [inventory]);

  // "N cards match these filters" = every card with a normal spare (the grid);
  // "Select all matching (N)" = the ones the app can actually create (eligible).
  const spareCards = candidateSet.matches.length + candidateSet.skipped.length;
  const eligible = candidateSet.matches.length;
  // The batch IS the filtered set — there is no per-card selection anymore.
  const included = candidateSet.matches;
  const priceMinor = priceMinorFromMajor(price);
  const priceValid = priceMinor !== undefined;

  const adjustmentPct = Number(tcgAdjustment);
  const fx = Number(fxRate);
  const tcgParamsValid = Number.isFinite(adjustmentPct) && Number.isFinite(fx) && fx > 0;
  const minPriceMinor = priceMinorFromMajor(minPrice);
  const minPriceValid = minPrice.trim() === "" || minPriceMinor !== undefined;
  const effectiveCurrency = currency;

  // Base price per row, before the floor. Flat mode: the typed price. TCG mode:
  // the card's own TCG market value (Normal, USD) × rate × (1 + adjustment %);
  // rows without TCG data fall back to the typed price.
  const basePriceMinorFor = (candidate: BulkCandidate): number | undefined => {
    if (priceMode === "tcg" && tcgParamsValid) {
      const usd = normalTcgUsd(candidate);
      if (usd != null) return Math.round(usd * fx * (1 + adjustmentPct / 100) * 100);
    }
    return priceMinor;
  };

  // One batch floor: nothing in the batch is listed below the minimum price.
  const unitPriceMinorFor = (candidate: BulkCandidate): number | undefined => {
    const base = basePriceMinorFor(candidate);
    if (base === undefined) return undefined;
    return minPriceMinor !== undefined ? Math.max(base, minPriceMinor) : base;
  };

  const allIncludedPriced = included.every(
    (candidate) => unitPriceMinorFor(candidate) !== undefined
  );
  // AC-BULK-4.4 / UX RV-6: the batch total is the sum of the per-row line
  // totals (quantity × unit price), never the listing count × price.
  const batchTotalMinor = included.reduce(
    (total, candidate) => total + candidate.quantity * (unitPriceMinorFor(candidate) ?? 0),
    0
  );

  const showPriceError = priceTouched && !priceValid && priceMode === "flat";
  const canConfirm =
    included.length >= 1 &&
    allIncludedPriced &&
    minPriceValid &&
    (priceMode === "tcg" ? tcgParamsValid : priceValid);
  const alreadyListedCount = candidateSet.skipped.filter(
    (skip) => skip.reason === "already listed"
  ).length;
  const noCopiesCount = candidateSet.skipped.length - alreadyListedCount;
  const createdCount = runRows.filter((row) => row.outcome.status === "created").length;
  const failedRows: BulkFailedRow[] = runRows.flatMap((row) =>
    row.outcome.status === "failed" ? [{ card: row.candidate.card, error: row.outcome.error }] : []
  );
  const skippedCount =
    runSkips.length + runRows.filter((row) => row.outcome.status === "skipped").length;

  useEffect(() => {
    onPhaseChange?.(mode);
  }, [mode, onPhaseChange]);

  // Step focus (UX-A11Y-3): entry, 1→2 and results land on the section heading.
  // During the run focus stays put (RN-6).
  useEffect(() => {
    if (mode === "running") return;
    headingRef.current?.focus();
  }, [mode]);

  // UX-A11Y-4: Back (and Escape, RV-18) return focus to the control that
  // opened step 2 — it only exists again once step 1 has rendered.
  useEffect(() => {
    if (mode !== "choose" || !restoreReviewFocusRef.current) return;
    restoreReviewFocusRef.current = false;
    reviewButtonRef.current?.focus();
  }, [mode]);

  const goBackToFilters = () => {
    restoreReviewFocusRef.current = true;
    setMode("choose");
  };

  const handleFiltersChange = (next: Record<string, string>) => {
    const withSpares = { ...next, spares: "1" };
    setFilters(withSpares);
    const nextSet = bulkListingCandidates({
      inventory,
      policy,
      ownListings,
      pendingTransactions,
      filters: withSpares,
    });
    selectionLive.announce(
      `${nextSet.matches.length} spares will be listed, ${nextSet.skipped.length} skipped`
    );
  };

  const handleClearFilters = () => handleFiltersChange({});

  // A new currency gets its own sensible conversion default.
  const handleCurrencyChange = (next: string) => {
    setCurrency(next);
    setFxRate(defaultFxFor(next));
  };

  const runItems = async (items: BulkCandidate[], skips: BulkSkip[]) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setSessionExpired(false);
    setMode("running");
    setProgress({ current: 0, total: items.length });
    setLastLine(null);

    const rows: BulkRunRow[] = [];
    let expired = false;

    for (const candidate of items) {
      let outcome: BulkCreateOutcome;
      if (expired) {
        // A 401 is session-level: stop calling and fail the remainder (E18).
        outcome = { status: "failed", error: SESSION_EXPIRED_MESSAGE };
      } else {
        const rowPrice = unitPriceMinorFor(candidate);
        if (rowPrice === undefined) {
          outcome = { status: "failed", error: "No price for this card" };
        } else {
          outcome = await marketplace.bulkCreateListing({
            cardId: candidate.card.id,
            quantity: candidate.quantity,
            priceMinor: rowPrice,
            currency: effectiveCurrency,
          });
          if (outcome.status === "failed" && outcome.httpStatus === 401) expired = true;
        }
      }
      rows.push({ candidate, outcome });
      setProgress({ current: rows.length, total: items.length });
      setLastLine(`Last: ${cardLabel(candidate)} — ${outcome.status}`);
      runLive.announce(`Creating ${rows.length} of ${items.length} listings`);
    }

    // A retry replaces the failed rows; created/skipped rows are never retried.
    const rowIds = new Set(rows.map((row) => row.candidate.card.id));
    const nextRows = [...runRows.filter((row) => !rowIds.has(row.candidate.card.id)), ...rows];
    setRunRows(nextRows);
    setSessionExpired(expired);

    const created = nextRows.filter((row) => row.outcome.status === "created").length;
    const failed = nextRows.filter((row) => row.outcome.status === "failed").length;
    const skipped = skips.length + nextRows.filter((row) => row.outcome.status === "skipped").length;
    runLive.announce(
      `${created} listings created${skipped > 0 ? ` · ${skipped} skipped` : ""}${
        failed > 0 ? ` · ${failed} failed` : ""
      }`,
      true
    );

    try {
      await onRefresh();
    } catch {
      // The page owns its refresh error banner; the results panel stays (S24).
    }
    runningRef.current = false;
    setMode("results");
  };

  const startRun = () => {
    if (!canConfirm || runningRef.current) return;
    setRunSkips(candidateSet.skipped);
    void runItems(included, candidateSet.skipped);
  };

  const handleRetry = () => {
    const failed = runRows
      .filter((row) => row.outcome.status === "failed")
      .map((row) => row.candidate);
    if (failed.length === 0) return;
    void runItems(failed, runSkips);
  };

  const scopeNote = (
    <div className="max-w-[76ch] space-y-1 text-xs leading-relaxed text-gray-400">
      <p>Bulk listing covers normal-printing spares only. Foil and holofoil spares stay as they are.</p>
      <p>
        {candidateSet.excludedVariantOnlyCount > 0 ? (
          <>
            <span className="font-semibold text-gray-300 tabular-nums">
              {candidateSet.excludedVariantOnlyCount}
            </span>{" "}
            cards in this filter have only foil or holofoil spares and can&#39;t be bulk listed.
          </>
        ) : (
          "No cards in this filter are excluded for foil or holofoil spares."
        )}
      </p>
    </div>
  );

  return (
    <section
      aria-labelledby="bulk-heading"
      className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-3"
      onKeyDown={(event) => {
        // RV-18/DD-11: Escape in step 2 is Back, never Cancel or a write.
        // During the run Escape does nothing (no stop control, DD-10).
        if (event.key === "Escape" && mode === "review") {
          event.preventDefault();
          goBackToFilters();
        }
      }}
    >
      <p className="sr-only" aria-live="polite" id="bulk-live-selection">
        {selectionLive.text}
      </p>
      <p className="sr-only" aria-live="polite" id="bulk-live-run">
        {runLive.text}
      </p>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="bulk-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-gray-100 focus:outline-none"
          >
            Bulk list spares
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-widest">
            <span className={mode === "choose" ? "text-amber-400" : "text-gray-400"}>
              1 · Filter spares
            </span>
            <span className={mode === "review" ? "text-amber-400" : "text-gray-400"}>
              2 · Review and price
            </span>
            <span
              className={mode === "running" || mode === "results" ? "text-amber-400" : "text-gray-400"}
            >
              3 · Create
            </span>
          </p>
        </div>
        {mode === "choose" || mode === "review" ? (
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 ${FOCUS_RING}`}
          >
            Cancel
          </button>
        ) : null}
      </div>

      {mode === "choose" ? (
        <>
          {scopeNote}
          <p className="max-w-[76ch] text-sm leading-relaxed text-gray-300">
            Every normal-printing spare that matches these filters will be listed. There&#39;s no
            per-card selection — shape the batch with the filters, then review the prices.
          </p>
          <FilterBar
            mode="picker"
            optionSource={options}
            filters={filters}
            onChange={handleFiltersChange}
            lockSparesOn
          />

          {!hasOwnedCards ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
              You have no cards in your collection. Add cards to your collection to list them for
              sale.
            </div>
          ) : spareCards === 0 ? (
            <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
              {candidateSet.excludedVariantOnlyCount > 0 ? (
                <p>
                  <span className="font-semibold text-gray-300 tabular-nums">
                    {candidateSet.excludedVariantOnlyCount}
                  </span>{" "}
                  cards in this filter have only foil or holofoil spares and can&#39;t be bulk listed.
                </p>
              ) : (
                <p className="font-semibold text-gray-100">No spare cards match these filters</p>
              )}
              <button
                type="button"
                onClick={handleClearFilters}
                className={`rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-500 ${FOCUS_RING}`}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-300" data-testid="bulk-match-count">
                <span className="font-semibold text-gray-100 tabular-nums">{eligible}</span>
                {` spares will be listed`}
                {spareCards > eligible ? (
                  <span className="text-gray-400">
                    {` · ${spareCards - eligible} skipped`}
                  </span>
                ) : null}
              </p>
              {eligible === 0 ? (
                <p className="text-xs text-gray-400">
                  Nothing in these filters can be listed right now — widen the filters.
                </p>
              ) : null}
              {alreadyListedCount > 0 || noCopiesCount > 0 ? (
                <p className="text-xs text-gray-400">
                  {alreadyListedCount > 0
                    ? `${alreadyListedCount} of these are already listed and will be skipped.`
                    : null}
                  {alreadyListedCount > 0 && noCopiesCount > 0 ? " " : null}
                  {noCopiesCount > 0
                    ? `${noCopiesCount} of these have no copies available and will be skipped.`
                    : null}
                </p>
              ) : null}

              {eligible > 0 ? (
                <CardGrid
                  informational
                  cards={candidateSet.matches.map((candidate) => candidate.card)}
                  ownedCardIds={new Set(candidateSet.matches.map((candidate) => candidate.card.id))}
                  ownedQuantities={ownedQuantities}
                  showSetName
                  surplusByCardId={surplus}
                />
              ) : null}

              <div className="sticky bottom-0 z-20 rounded-xl border border-gray-800 bg-gray-900/95 p-4 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.9)] backdrop-blur">
                <p
                  className="text-sm font-semibold tabular-nums text-gray-100"
                  data-testid="bulk-selection-count"
                >
                  {`${included.length} spares in this batch · `}
                  <span className="font-semibold text-amber-300">
                    {`${included.length} listings to create`}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  The batch follows the filters — change a filter to change the batch.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 sm:justify-end">
                  <button
                    ref={reviewButtonRef}
                    type="button"
                    onClick={() => setMode("review")}
                    disabled={included.length === 0}
                    className={`rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-900 disabled:text-amber-300 disabled:hover:bg-amber-900 ${STICKY_RING}`}
                  >
                    Review and price →
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      {mode === "review" ? (
        <>
          {scopeNote}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-300">Price source</span>
            <div
              role="group"
              aria-label="Price source"
              className="inline-flex rounded-lg border border-gray-700 p-0.5"
            >
              <button
                type="button"
                aria-pressed={priceMode === "flat"}
                onClick={() => setPriceMode("flat")}
                className={`rounded-md px-3 py-1 text-sm ${
                  priceMode === "flat"
                    ? "bg-amber-500 font-semibold text-gray-950"
                    : "text-gray-300 hover:text-gray-100"
                } ${FOCUS_RING}`}
              >
                Flat price
              </button>
              <button
                type="button"
                aria-pressed={priceMode === "tcg"}
                onClick={() => setPriceMode("tcg")}
                className={`rounded-md px-3 py-1 text-sm ${
                  priceMode === "tcg"
                    ? "bg-amber-500 font-semibold text-gray-950"
                    : "text-gray-300 hover:text-gray-100"
                } ${FOCUS_RING}`}
              >
                TCG market ± %
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {priceMode === "tcg"
                ? "Each card is priced from its TCG market value (Normal), then the adjustment and minimum apply."
                : "One price for every listing in the batch."}
            </span>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label htmlFor="bulk-price" className="block text-sm text-gray-300">
                {priceMode === "tcg"
                  ? "Fallback price (cards without TCG data)"
                  : "Unit price (per copy)"}
              </label>
              <input
                id="bulk-price"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                onBlur={() => setPriceTouched(true)}
                onKeyDown={(event) => {
                  // Enter never submits the batch (RV-17 / DD-5); it moves focus.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmRef.current?.focus();
                  }
                }}
                aria-invalid={showPriceError || undefined}
                aria-describedby={showPriceError ? "bulk-price-error" : undefined}
                className={`mt-1 w-full max-w-[220px] rounded border bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
                  showPriceError ? "border-red-500" : "border-gray-500 hover:border-gray-400"
                }`}
              />
              {showPriceError ? (
                <span id="bulk-price-error" className="mt-1 block text-xs text-red-300">
                  Enter a unit price to continue.
                </span>
              ) : null}
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="bulk-currency" className="block text-sm text-gray-300">
                Currency
              </label>
              <select
                id="bulk-currency"
                value={currency}
                onChange={(event) => handleCurrencyChange(event.target.value)}
                className="mt-1 w-[120px] rounded border border-gray-500 bg-gray-950 px-3 py-2 text-sm text-gray-100 hover:border-gray-400 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
              >
                {MARKETPLACE_CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            {priceMode === "tcg" ? (
              <>
                <div className="lg:col-span-2">
                  <label htmlFor="bulk-fx" className="block text-sm text-gray-300">
                    {`1 USD = ? ${currency}`}
                  </label>
                  <input
                    id="bulk-fx"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={defaultFxFor(currency)}
                    value={fxRate}
                    onChange={(event) => setFxRate(event.target.value)}
                    className="mt-1 w-[120px] rounded border border-gray-500 bg-gray-950 px-3 py-2 text-sm text-gray-100 hover:border-gray-400 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                  />
                  {!tcgParamsValid ? (
                    <span className="mt-1 block text-xs text-red-300">
                      Enter a positive rate.
                    </span>
                  ) : null}
                </div>
                <div className="lg:col-span-2">
                  <label htmlFor="bulk-adjust" className="block text-sm text-gray-300">
                    Adjustment %
                  </label>
                  <input
                    id="bulk-adjust"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={tcgAdjustment}
                    onChange={(event) => setTcgAdjustment(event.target.value)}
                    className="mt-1 w-[120px] rounded border border-gray-500 bg-gray-950 px-3 py-2 text-sm text-gray-100 hover:border-gray-400 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    Rough price. 0% = TCG market.
                  </span>
                </div>
              </>
            ) : null}
            <div className="lg:col-span-3">
              <label htmlFor="bulk-min" className="block text-sm text-gray-300">
                Minimum price (per card)
              </label>
              <input
                id="bulk-min"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="No minimum"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                aria-invalid={!minPriceValid || undefined}
                className={`mt-1 w-[140px] rounded border bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
                  !minPriceValid ? "border-red-500" : "border-gray-500 hover:border-gray-400"
                }`}
              />
              <span className="mt-1 block text-xs text-gray-500">
                Anything cheaper is listed at this price.
              </span>
              {!minPriceValid ? (
                <span className="mt-1 block text-xs text-red-300">
                  Enter a valid minimum price.
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-sm text-gray-300">
              Condition: Not specified · no photos · no location or note
            </p>
            <p className="mt-1 text-xs text-gray-400">
              You can change these on any listing afterwards from Your listings.
            </p>
          </div>

          <p className="text-sm text-gray-300 tabular-nums" data-testid="bulk-totals">
            {`${included.length} listings`}
            <span className="text-gray-500"> · </span>
            Batch total{" "}
            <span className="font-semibold text-gray-100">
              {allIncludedPriced ? formatPriceMinor(batchTotalMinor, effectiveCurrency) : "—"}
            </span>
          </p>

          <BulkListingTable
            candidates={candidateSet.matches}
            priceMinorFor={unitPriceMinorFor}
            currency={effectiveCurrency}
          />

          <BulkListingSkipList skipped={candidateSet.skipped} />

          <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-800 bg-gray-900/95 p-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.9)] backdrop-blur">
            <button
              type="button"
              onClick={goBackToFilters}
              className={`rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 ${STICKY_RING}`}
            >
              Back to filters
            </button>
            <span className="text-sm text-gray-300 tabular-nums" data-testid="bulk-sticky-total">
              Batch total{" "}
              <span className="font-semibold text-gray-100">
                {allIncludedPriced ? formatPriceMinor(batchTotalMinor, effectiveCurrency) : "—"}
              </span>
            </span>
            <button
              ref={confirmRef}
              type="button"
              onClick={startRun}
              disabled={!canConfirm}
              aria-describedby={
                showPriceError ? "bulk-price-error" : undefined
              }
              className={`rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 tabular-nums whitespace-nowrap hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-900 disabled:text-amber-300 disabled:hover:bg-amber-900 ${STICKY_RING}`}
            >
              {included.length === 0 ? "Nothing to create" : `Create ${included.length} listings`}
            </button>
          </div>
        </>
      ) : null}

      {mode === "running" ? (
        <BulkRunProgress current={progress.current} total={progress.total} lastLine={lastLine} />
      ) : null}

      {mode === "results" ? (
        <BulkResults
          created={createdCount}
          skippedCount={skippedCount}
          failed={failedRows}
          skipped={runSkips}
          sessionExpired={sessionExpired}
          onRetry={handleRetry}
          onDone={onDone}
        />
      ) : null}
    </section>
  );
}
