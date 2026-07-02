import { useEffect, useRef, useState } from "react";
import { cards as cardsApi } from "../services/api";
import type { FilterOptions } from "../types";

interface FilterBarProps {
  filters: Record<string, string>;
  onChange: (filters: Record<string, string>) => void;
  showOwnership?: boolean;
}

export default function FilterBar({
  filters,
  onChange,
  showOwnership = false,
}: FilterBarProps) {
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [rarityOpen, setRarityOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const rarityRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardsApi.filters().then(setOptions).catch(console.error);
  }, []);

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

  const selectedRarities = filters.rarity
    ? filters.rarity.split(",").filter(Boolean)
    : [];

  const toggleRarity = (rarity: string) => {
    const set = new Set(selectedRarities);
    if (set.has(rarity)) {
      set.delete(rarity);
    } else {
      set.add(rarity);
    }
    update("rarity", Array.from(set).join(","));
  };

  const selectedSets = filters.set
    ? filters.set.split(",").filter(Boolean)
    : [];

  const toggleSet = (setName: string) => {
    const set = new Set(selectedSets);
    if (set.has(setName)) {
      set.delete(setName);
    } else {
      set.add(setName);
    }
    update("set", Array.from(set).join(","));
  };

  const selectedColors = filters.color
    ? filters.color.split(",").filter(Boolean)
    : [];

  const toggleColor = (color: string) => {
    const set = new Set(selectedColors);
    if (set.has(color)) {
      set.delete(color);
    } else {
      set.add(color);
    }
    update("color", Array.from(set).join(","));
  };

  const selectedTypes = filters.type
    ? filters.type.split(",").filter(Boolean)
    : [];

  const toggleType = (type: string) => {
    const set = new Set(selectedTypes);
    if (set.has(type)) {
      set.delete(type);
    } else {
      set.add(type);
    }
    update("type", Array.from(set).join(","));
  };

  if (!options) return null;

  return (
    <div className="flex flex-wrap gap-2 p-3 bg-gray-900 rounded-lg">
      <input
        type="text"
        placeholder="Search by name..."
        value={filters.search || ""}
        onChange={(e) => update("search", e.target.value)}
        className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"
      />

      {/* Color multi-select */}
      <div ref={colorRef} className="relative">
        <button
          type="button"
          onClick={() => setColorOpen((o) => !o)}
          className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap"
        >
          {selectedColors.length === 0
            ? "All Colors"
            : selectedColors.length === 1
              ? selectedColors[0]
              : `${selectedColors.length} selected`}
        </button>
        {colorOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[160px]">
            {options.colors.map((c) => {
              const checked = selectedColors.includes(c);
              return (
                <label
                  key={c}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleColor(c)}
                    className="rounded accent-amber-500"
                  />
                  {c}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Types (subtypes) multi-select */}
      <div ref={typeRef} className="relative">
        <button
          type="button"
          onClick={() => setTypeOpen((o) => !o)}
          className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap"
        >
          {selectedTypes.length === 0
            ? "All Types"
            : selectedTypes.length === 1
              ? selectedTypes[0]
              : `${selectedTypes.length} selected`}
        </button>
        {typeOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[180px] max-h-64 overflow-y-auto">
            {options.types.map((t) => {
              const checked = selectedTypes.includes(t);
              return (
                <label
                  key={t}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(t)}
                    className="rounded accent-amber-500"
                  />
                  {t}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Set multi-select */}
      <div ref={setRef} className="relative">
        <button
          type="button"
          onClick={() => setSetOpen((o) => !o)}
          className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap"
        >
          {selectedSets.length === 0
            ? "All Sets"
            : selectedSets.length === 1
              ? selectedSets[0]
              : `${selectedSets.length} selected`}
        </button>
        {setOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[220px] max-h-64 overflow-y-auto">
            {options.sets.map((s) => {
              const checked = selectedSets.includes(s);
              return (
                <label
                  key={s}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSet(s)}
                    className="rounded accent-amber-500"
                  />
                  {s}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Rarity multi-select */}
      <div ref={rarityRef} className="relative">
        <button
          type="button"
          onClick={() => setRarityOpen((o) => !o)}
          className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap"
        >
          {selectedRarities.length === 0
            ? "All Rarities"
            : selectedRarities.length === 1
              ? selectedRarities[0]
              : `${selectedRarities.length} selected`}
        </button>
        {rarityOpen && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[180px]">
            {options.rarities.map((r) => {
              const checked = selectedRarities.includes(r);
              return (
                <label
                  key={r}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRarity(r)}
                    className="rounded accent-amber-500"
                  />
                  {r}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Card type (Character/Action/Item) single-select */}
      <select
        value={filters.cardType || ""}
        onChange={(e) => update("cardType", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">Card Type</option>
        {options.cardTypes.map((t) => (
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
    </div>
  );
}
