export type InkableValue = "" | "inkable" | "non-inkable";

interface TriStateToggleProps {
  value: InkableValue;
  onChange: (value: InkableValue) => void;
}

const OPTIONS: Array<{ value: InkableValue; label: string }> = [
  { value: "", label: "All" },
  { value: "inkable", label: "Inkable" },
  { value: "non-inkable", label: "Non-inkable" },
];

/**
 * Fixed tri-state Inkable control (REQ-FILT-7). Three options — All / Inkable /
 * Non-inkable — where "All" clears the value back to "" (no constraint).
 */
export default function TriStateToggle({ value, onChange }: TriStateToggleProps) {
  return (
    <div role="group" aria-label="Inkable" className="inline-flex overflow-hidden rounded-md border border-gray-700">
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`px-3 py-1.5 text-sm whitespace-nowrap focus:outline-none focus:border-amber-500 ${
              active
                ? "bg-amber-500 text-gray-950 font-semibold"
                : "bg-gray-800 text-gray-100 hover:bg-gray-700"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
