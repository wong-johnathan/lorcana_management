import { useEffect, useRef, useState } from "react";
import { cards as cardsApi } from "../services/api";
import type { FilterOptions } from "../types";
import SearchableMultiSelect from "./SearchableMultiSelect";
import TriStateToggle, { type InkableValue } from "./TriStateToggle";
import FilterSheet from "./FilterSheet";
import { DESKTOP_QUERY, useMediaQuery } from "../hooks/useMediaQuery";

interface FilterBarProps {
  filters: Record<string, string>;
  onChange: (filters: Record<string, string>) => void;
  showOwnership?: boolean;
  /** "picker" renders only search + color/set/rarity (listing picker, REQ-UX-4). */
  mode?: "full" | "picker";
  /** When provided, used as the option set and `cardsApi.filters()` is skipped. */
  optionSource?: FilterOptions;
  /** Disable the "Spares only" toggle (REQ-SPARE-4): true when keep policy is null. */
  sparesDisabled?: boolean;
  /**
   * Bulk listing (REQ-BULK-2.2, design §6.1): render "Spares only" forced on and
   * non-interactive, with the "Always on for bulk listing" description. This is
   * additive to `sparesDisabled`, which keeps its "policy missing" meaning.
   */
  lockSparesOn?: boolean;
}

export default function FilterBar({
  filters,
  onChange,
  showOwnership = false,
  mode = "full",
  optionSource,
  sparesDisabled = false,
  lockSparesOn = false,
}: FilterBarProps) {
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [rarityOpen, setRarityOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const rarityRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (optionSource) return;
    cardsApi.filters().then(setOptions).catch(console.error);
  }, [optionSource]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rarityRef.current && !rarityRef.current.contains(e.target as Node)) {
        setRarityOpen(false);
      }
      if (setRef.current && !setRef.current.contains(e.target as Node)) {
        setSetOpen(false);
      }
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    }
    if (rarityOpen || setOpen || colorOpen || typeOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [rarityOpen, setOpen, colorOpen, typeOpen]);

  const update = (key: string, value: string) => {
    const next = { ...filters };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    onChange(next);
  };

  // ── Multi-select helpers ──

  const splitCsv = (value: string | undefined): string[] =>
    value ? value.split(",").filter(Boolean) : [];

  const toggleValue = (key: string, value: string, current: string[]) => {
    const set = new Set(current);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    update(key, Array.from(set).join(","));
  };

  const selectedRarities = splitCsv(filters.rarity);
  const selectedSets = splitCsv(filters.set);
  const selectedColors = splitCsv(filters.color);
  const selectedTypes = splitCsv(filters.type);

  // Picker-only selections (REQ-FILT-6..9).
  const selectedCosts = splitCsv(filters.cost);
  const selectedCardTypes = splitCsv(filters.cardType);
  const selectedSubtypes = splitCsv(filters.subtype);

  const toggleRarity = (rarity: string) => toggleValue("rarity", rarity, selectedRarities);
  const toggleSet = (setName: string) => toggleValue("set", setName, selectedSets);
  const toggleColor = (color: string) => toggleValue("color", color, selectedColors);
  const toggleType = (type: string) => toggleValue("type", type, selectedTypes);
  const toggleCost = (cost: string) => toggleValue("cost", cost, selectedCosts);
  const toggleCardType = (cardType: string) => toggleValue("cardType", cardType, selectedCardTypes);
  const toggleSubtype = (subtype: string) => toggleValue("subtype", subtype, selectedSubtypes);

  const resolvedOptions = optionSource ?? options;
  const isPicker = mode === "picker";
  const sparesOn = filters.spares === "1";

  if (!resolvedOptions) return null;

  const activeFilterCount = Object.keys(filters).filter(
    (k) => filters[k] && filters[k] !== ""
  ).length;

  // The badge on the mobile trigger ignores `spares`, which bulk listing forces on.
  const badgeCount = Object.keys(filters).filter(
    (k) => k !== "spares" && filters[k] && filters[k] !== ""
  ).length;

  const costOptions = (resolvedOptions.costs ?? []).map((cost) => String(cost));
  const inkableValue: InkableValue =
    filters.inkable === "inkable" || filters.inkable === "non-inkable"
      ? filters.inkable
      : "";

  const fullDropdownClass =
    "bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap";

  const searchField = (
    <div className="relative flex-1 min-w-[200px]">
      <input
        type="text"
        placeholder="Search by name..."
        value={filters.search || ""}
        onChange={(e) => update("search", e.target.value)}
        className={`w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500 ${isPicker ? "pr-7" : ""}`}
      />
      {isPicker && filters.search && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => update("search", "")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200 text-sm px-1"
        >
          ✕
        </button>
      )}
    </div>
  );

  const filterFields = (
    <>
      {isPicker ? (
        <>
          {/* Picker mode: enhanced filters + searchable multi-selects (REQ-FILT-6..11). */}
          <SearchableMultiSelect
            label="Costs"
            options={costOptions}
            selected={selectedCosts}
            onToggle={toggleCost}
          />
          <TriStateToggle value={inkableValue} onChange={(value) => update("inkable", value)} />
          <div className="flex items-center gap-2">
            {lockSparesOn ? (
              <>
                <button
                  type="button"
                  aria-pressed="true"
                  aria-describedby="bulk-spares-lock-note"
                  disabled
                  className="px-3 py-1.5 text-sm whitespace-nowrap rounded-md border border-amber-300/40 bg-amber-500 text-gray-950 font-semibold cursor-not-allowed"
                >
                  ✓ Spares only
                </button>
                <span id="bulk-spares-lock-note" className="text-xs text-gray-400">
                  Always on for bulk listing
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-pressed={sparesOn}
                  disabled={sparesDisabled}
                  onClick={() => update("spares", sparesOn ? "" : "1")}
                  className={`px-3 py-1.5 text-sm whitespace-nowrap rounded-md border border-gray-700 focus:outline-none focus:border-amber-500 ${
                    sparesOn
                      ? "bg-amber-500 text-gray-950 font-semibold"
                      : "bg-gray-800 text-gray-100 hover:bg-gray-700"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Spares only
                </button>
                {sparesDisabled && (
                  <span className="text-xs text-gray-500">
                    Spares only is unavailable — your keep policy couldn't be loaded.
                  </span>
                )}
              </>
            )}
          </div>
          <SearchableMultiSelect
            label="Types"
            options={resolvedOptions.cardTypes}
            selected={selectedCardTypes}
            onToggle={toggleCardType}
          />
          <SearchableMultiSelect
            label="Classifications"
            options={resolvedOptions.types}
            selected={selectedSubtypes}
            onToggle={toggleSubtype}
          />
          <SearchableMultiSelect
            label="Colors"
            options={resolvedOptions.colors}
            selected={selectedColors}
            onToggle={toggleColor}
          />
          <SearchableMultiSelect
            label="Sets"
            options={resolvedOptions.sets}
            selected={selectedSets}
            onToggle={toggleSet}
          />
          <SearchableMultiSelect
            label="Rarities"
            options={resolvedOptions.rarities}
            selected={selectedRarities}
            onToggle={toggleRarity}
          />
        </>
      ) : (
        <>
          {/* Full mode: unchanged markup (AC-FILT-14). */}
          {/* Color multi-select */}
          <div ref={colorRef} className="relative">
            <button type="button" onClick={() => setColorOpen((o) => !o)} className={fullDropdownClass}>
              {selectedColors.length === 0
                ? "All Colors"
                : selectedColors.length === 1
                  ? selectedColors[0]
                  : `${selectedColors.length} selected`}
            </button>
            {colorOpen && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[160px]">
                {resolvedOptions.colors.map((c) => {
                  const checked = selectedColors.includes(c);
                  return (
                    <label key={c} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100">
                      <input type="checkbox" checked={checked} onChange={() => toggleColor(c)} className="rounded accent-amber-500" />
                      {c}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Types (subtypes) multi-select — hidden in picker mode */}
          <div ref={typeRef} className="relative">
            <button type="button" onClick={() => setTypeOpen((o) => !o)} className={fullDropdownClass}>
              {selectedTypes.length === 0
                ? "All Types"
                : selectedTypes.length === 1
                  ? selectedTypes[0]
                  : `${selectedTypes.length} selected`}
            </button>
            {typeOpen && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[180px] max-h-64 overflow-y-auto">
                {resolvedOptions.types.map((t) => {
                  const checked = selectedTypes.includes(t);
                  return (
                    <label key={t} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100">
                      <input type="checkbox" checked={checked} onChange={() => toggleType(t)} className="rounded accent-amber-500" />
                      {t}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Set multi-select */}
          <div ref={setRef} className="relative">
            <button type="button" onClick={() => setSetOpen((o) => !o)} className={fullDropdownClass}>
              {selectedSets.length === 0
                ? "All Sets"
                : selectedSets.length === 1
                  ? selectedSets[0]
                  : `${selectedSets.length} selected`}
            </button>
            {setOpen && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[220px] max-h-64 overflow-y-auto">
                {resolvedOptions.sets.map((s) => {
                  const checked = selectedSets.includes(s);
                  return (
                    <label key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100">
                      <input type="checkbox" checked={checked} onChange={() => toggleSet(s)} className="rounded accent-amber-500" />
                      {s}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rarity multi-select */}
          <div ref={rarityRef} className="relative">
            <button type="button" onClick={() => setRarityOpen((o) => !o)} className={fullDropdownClass}>
              {selectedRarities.length === 0
                ? "All Rarities"
                : selectedRarities.length === 1
                  ? selectedRarities[0]
                  : `${selectedRarities.length} selected`}
            </button>
            {rarityOpen && (
              <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[180px]">
                {resolvedOptions.rarities.map((r) => {
                  const checked = selectedRarities.includes(r);
                  return (
                    <label key={r} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100">
                      <input type="checkbox" checked={checked} onChange={() => toggleRarity(r)} className="rounded accent-amber-500" />
                      {r}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card type (Character/Action/Item) single-select — hidden in picker mode */}
          <select
            value={filters.cardType || ""}
            onChange={(e) => update("cardType", e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value="">Card Type</option>
            {resolvedOptions.cardTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filters.analyzed || ""}
            onChange={(e) => update("analyzed", e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value="">AI Analysis</option>
            <option value="yes">Analyzed</option>
            <option value="no">Not Analyzed</option>
          </select>

          <select
            value={filters.sort || ""}
            onChange={(e) => update("sort", e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value="">Sort: Default</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>

          {showOwnership && (
            <select
              value={filters.ownership || ""}
              onChange={(e) => update("ownership", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">All Cards</option>
              <option value="owned">Owned</option>
              <option value="not_owned">Not Owned</option>
            </select>
          )}
        </>
      )}

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 focus:outline-none focus:border-amber-500 transition-colors whitespace-nowrap"
        >
          ✕ Clear all{activeFilterCount > 1 ? ` (${activeFilterCount})` : ""}
        </button>
      )}
    </>
  );

  if (!isDesktop) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {searchField}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            className="shrink-0 whitespace-nowrap rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-semibold text-gray-100 hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            {badgeCount > 0 ? `Filters (${badgeCount})` : "Filters"}
          </button>
        </div>

        <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters">
          <div className="flex flex-col gap-2">{filterFields}</div>
        </FilterSheet>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 p-3 bg-gray-900 rounded-lg">
      {searchField}
      {filterFields}
    </div>
  );
}
