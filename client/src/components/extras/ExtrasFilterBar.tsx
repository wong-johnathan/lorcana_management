import { useEffect, useRef, useState } from "react";
import type { ExtrasFilters, ExtrasFilterOptions } from "./extrasUi";
import ExtrasSearchInput from "./ExtrasSearchInput";

interface ExtrasFilterBarProps {
  filters: ExtrasFilters;
  onChange: (filters: ExtrasFilters) => void;
  options: ExtrasFilterOptions;
  searchPlaceholder?: string;
}

function MultiSelectDropdown({
  allLabel,
  options,
  selected,
  onToggle,
}: {
  allLabel: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap"
      >
        {selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selected`}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[180px] max-h-64 overflow-y-auto">
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(opt)}
                  className="rounded accent-amber-500"
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ExtrasFilterBar({ filters, onChange, options, searchPlaceholder = "Search cards..." }: ExtrasFilterBarProps) {
  const toggle = (key: "sets" | "rarities" | "colors", value: string) => {
    const current = filters[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  const activeCount = filters.sets.length + filters.rarities.length + filters.colors.length + (filters.query.trim() ? 1 : 0);

  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex-1 min-w-[180px]">
        <ExtrasSearchInput value={filters.query} onChange={(query) => onChange({ ...filters, query })} placeholder={searchPlaceholder} />
      </div>
      <MultiSelectDropdown allLabel="All Sets" options={options.sets} selected={filters.sets} onToggle={(v) => toggle("sets", v)} />
      <MultiSelectDropdown allLabel="All Rarities" options={options.rarities} selected={filters.rarities} onToggle={(v) => toggle("rarities", v)} />
      <MultiSelectDropdown allLabel="All Colors" options={options.colors} selected={filters.colors} onToggle={(v) => toggle("colors", v)} />
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange({ query: "", sets: [], rarities: [], colors: [] })}
          className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 focus:outline-none focus:border-amber-500 transition-colors whitespace-nowrap"
        >
          ✕ Clear{activeCount > 1 ? ` (${activeCount})` : ""}
        </button>
      )}
    </div>
  );
}
