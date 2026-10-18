import type { MarketplaceControls } from "../../utils/marketplaceParams";
import {
  MARKETPLACE_CONDITION_OPTIONS,
  MARKETPLACE_CURRENCY_OPTIONS,
  MARKETPLACE_VARIANT_OPTIONS,
} from "../../utils/marketplaceParams";

interface MarketplaceFilterBarProps {
  controls: MarketplaceControls;
  onChange: (patch: Partial<MarketplaceControls>) => void;
}

/**
 * Public marketplace filter bar. The browse page owns the URL, so this
 * component is fully controlled: it emits patches and never mutates state.
 */
export default function MarketplaceFilterBar({ controls, onChange }: MarketplaceFilterBarProps) {
  const activeFilterCount = [
    controls.q,
    controls.variant,
    controls.condition,
    controls.priceMin,
    controls.priceMax,
    controls.currency,
  ].filter((value) => value !== "").length;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <label className="min-w-[200px] flex-1 text-xs text-gray-400">
        Search
        <input
          type="text"
          placeholder="Search by name or set..."
          value={controls.q}
          onChange={(event) => onChange({ q: event.target.value })}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
        />
      </label>

      <label className="text-xs text-gray-400">
        Variant
        <select
          value={controls.variant}
          onChange={(event) => onChange({ variant: event.target.value })}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="">All variants</option>
          {MARKETPLACE_VARIANT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-gray-400">
        Condition
        <select
          value={controls.condition}
          onChange={(event) => onChange({ condition: event.target.value })}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="">All conditions</option>
          {MARKETPLACE_CONDITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-gray-400">
        Currency
        <select
          value={controls.currency}
          onChange={(event) => onChange({ currency: event.target.value })}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
        >
          <option value="">All currencies</option>
          {MARKETPLACE_CURRENCY_OPTIONS.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-gray-400">
        Min price
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="any"
          value={controls.priceMin}
          onChange={(event) => onChange({ priceMin: event.target.value })}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
        />
      </label>

      <label className="text-xs text-gray-400">
        Max price
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="any"
          value={controls.priceMax}
          onChange={(event) => onChange({ priceMax: event.target.value })}
          className="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
        />
      </label>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() =>
            onChange({ q: "", variant: "", condition: "", priceMin: "", priceMax: "", currency: "" })
          }
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 focus:border-amber-500 focus:outline-none"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
