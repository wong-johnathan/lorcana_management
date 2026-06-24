import { useEffect, useState } from "react";
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

  useEffect(() => {
    cardsApi.filters().then(setOptions).catch(console.error);
  }, []);

  const update = (key: string, value: string) => {
    const next = { ...filters };
    if (value) {
      next[key] = value;
    } else {
      delete next[key];
    }
    onChange(next);
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

      <select
        value={filters.color || ""}
        onChange={(e) => update("color", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">All Colors</option>
        {options.colors.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={filters.set || ""}
        onChange={(e) => update("set", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">All Sets</option>
        {options.sets.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        value={filters.rarity || ""}
        onChange={(e) => update("rarity", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">All Rarities</option>
        {options.rarities.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <select
        value={filters.cardType || ""}
        onChange={(e) => update("cardType", e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
      >
        <option value="">All Types</option>
        {options.cardTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
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
