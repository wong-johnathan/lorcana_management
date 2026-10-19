import type { FilterOptions } from "../../types";
import type { MarketplaceControls } from "../../utils/marketplaceParams";
import {
  MARKETPLACE_CONDITION_OPTIONS,
  MARKETPLACE_CURRENCY_OPTIONS,
  MARKETPLACE_VARIANT_OPTIONS,
} from "../../utils/marketplaceParams";
import SearchableMultiSelect from "../SearchableMultiSelect";
import TriStateToggle, { type InkableValue } from "../TriStateToggle";

interface MarketplaceFilterBarProps {
  controls: MarketplaceControls;
  onChange: (patch: Partial<MarketplaceControls>) => void;
  /** Full-catalog filter options fetched once by the browse page (REQ-FILT-19). */
  optionSource?: FilterOptions | null;
}

/**
 * Public marketplace filter bar. The browse page owns the URL, so this
 * component is fully controlled: it emits patches and never mutates state.
 */
export default function MarketplaceFilterBar({
  controls,
  onChange,
  optionSource,
}: MarketplaceFilterBarProps) {
  const activeFilterCount = [
    controls.q,
    controls.variant,
    controls.condition,
    controls.priceMin,
    controls.priceMax,
    controls.currency,
    controls.costs,
    controls.inkable,
    controls.cardTypes,
    controls.subtypes,
  ].filter((value) => value !== "").length;

  const splitCsv = (value: string): string[] =>
    value ? value.split(",").filter(Boolean) : [];

  const toggleCsv = (
    key: "costs" | "cardTypes" | "subtypes",
    value: string,
    current: string
  ) => {
    const set = new Set(splitCsv(current));
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    onChange({ [key]: Array.from(set).join(",") } as Partial<MarketplaceControls>);
  };

  const inkableValue: InkableValue =
    controls.inkable === "inkable" || controls.inkable === "non-inkable"
      ? controls.inkable
      : "";

  const costOptions = (optionSource?.costs ?? []).map((cost) => String(cost));

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <label className="min-w-[200px] flex-1 text-xs text-gray-400">
        Search
        <div className="relative mt-1">
          <input
            type="text"
            placeholder="Search by name or set..."
            value={controls.q}
            onChange={(event) => onChange({ q: event.target.value })}
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 pr-8 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-500 focus:outline-none"
          />
          {controls.q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ q: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>
      </label>

      {optionSource && (
        <>
          <div className="text-xs text-gray-400">
            <span className="mb-1 block">Cost</span>
            <SearchableMultiSelect
              label="Costs"
              options={costOptions}
              selected={splitCsv(controls.costs)}
              onToggle={(value) => toggleCsv("costs", value, controls.costs)}
            />
          </div>

          <div className="text-xs text-gray-400">
            <span className="mb-1 block">Inkable</span>
            <TriStateToggle
              value={inkableValue}
              onChange={(value) => onChange({ inkable: value })}
            />
          </div>

          <div className="text-xs text-gray-400">
            <span className="mb-1 block">Type</span>
            <SearchableMultiSelect
              label="Types"
              options={optionSource.cardTypes}
              selected={splitCsv(controls.cardTypes)}
              onToggle={(value) => toggleCsv("cardTypes", value, controls.cardTypes)}
            />
          </div>

          <div className="text-xs text-gray-400">
            <span className="mb-1 block">Classification</span>
            <SearchableMultiSelect
              label="Classifications"
              options={optionSource.types}
              selected={splitCsv(controls.subtypes)}
              onToggle={(value) => toggleCsv("subtypes", value, controls.subtypes)}
            />
          </div>
        </>
      )}

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
            onChange({
              q: "",
              variant: "",
              condition: "",
              priceMin: "",
              priceMax: "",
              currency: "",
              costs: "",
              inkable: "",
              cardTypes: "",
              subtypes: "",
            })
          }
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200 focus:border-amber-500 focus:outline-none"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
