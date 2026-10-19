import { useEffect, useRef, useState } from "react";

interface SearchableMultiSelectProps {
  /** Plural noun used in the "All X" button label and the search aria-label. */
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Optional display formatter for an option value (e.g. cost labels). */
  renderLabel?: (value: string) => string;
}

/**
 * Reusable searchable multi-select dropdown (REQ-FILT-10/11). A button shows
 * "All X" / the single selected value / "N selected"; opening it reveals a
 * search input above a checkbox list. The search narrows the option list by
 * case-insensitive substring while preserving check state; clearing it restores
 * the full list. Click-outside closes; each instance is independently open.
 */
export default function SearchableMultiSelect({
  label,
  options,
  selected,
  onToggle,
  renderLabel,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter((option) => option.toLowerCase().includes(normalized))
    : options;

  const display = (value: string) => (renderLabel ? renderLabel(value) : value);

  const buttonText =
    selected.length === 0
      ? `All ${label}`
      : selected.length === 1
        ? display(selected[0])
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-sm text-gray-100 hover:border-gray-600 focus:outline-none focus:border-amber-500 min-w-[130px] text-left whitespace-nowrap"
      >
        {buttonText}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-30 py-1 min-w-[200px]">
          <div className="px-2 pb-1">
            <input
              type="text"
              value={query}
              placeholder="Search..."
              aria-label={`Search ${label}`}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((value) => {
              const checked = selected.includes(value);
              return (
                <label
                  key={value}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer text-sm text-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(value)}
                    className="rounded accent-amber-500"
                  />
                  {display(value)}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
