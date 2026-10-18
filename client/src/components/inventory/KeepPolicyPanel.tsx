import { useEffect, useRef, useState } from "react";
import type { InventoryPolicy } from "../../types";

interface KeepPolicyPanelProps {
  policy: InventoryPolicy;
  saving?: boolean;
  onSave: (policy: InventoryPolicy) => Promise<void> | void;
}

export default function KeepPolicyPanel({
  policy,
  saving = false,
  onSave,
}: KeepPolicyPanelProps) {
  const [form, setForm] = useState<InventoryPolicy>(policy);
  const [error, setError] = useState<string | null>(null);
  const lastPolicyRef = useRef(policy);

  useEffect(() => {
    if (lastPolicyRef.current !== policy) {
      lastPolicyRef.current = policy;
      setForm(policy);
    }
  }, [policy]);

  const setNumber = (key: keyof Pick<InventoryPolicy, "keepNormalQuantity" | "keepFoilQuantity" | "keepHolofoilQuantity">, value: string) => {
    const parsed = Number(value);
    setForm((current) => ({ ...current, [key]: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0 }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if ([form.keepNormalQuantity, form.keepFoilQuantity, form.keepHolofoilQuantity].some((value) => value < 0 || !Number.isInteger(value))) {
      setError("Keep quantities must be non-negative integers");
      return;
    }
    setError(null);
    await onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h3 className="font-medium">Keep policy</h3>
        <p className="mt-1 text-sm text-gray-400">
          How many copies of each card to keep. Anything above this counts as surplus when you bulk trim your collection.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Keep normal</span>
          <input
            type="number"
            min={0}
            value={form.keepNormalQuantity}
            onChange={(event) => setNumber("keepNormalQuantity", event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Keep foil</span>
          <input
            type="number"
            min={0}
            value={form.keepFoilQuantity}
            onChange={(event) => setNumber("keepFoilQuantity", event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Keep holofoil</span>
          <input
            type="number"
            min={0}
            value={form.keepHolofoilQuantity}
            onChange={(event) => setNumber("keepHolofoilQuantity", event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-gray-100"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save keep policy"}
        </button>
      </div>
    </form>
  );
}
