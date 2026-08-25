import type { InventoryStats } from "../../types";
import CollectionSetBreakdown from "./CollectionSetBreakdown";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

interface CollectionStatsPanelProps {
  stats: InventoryStats;
}

function StatCard({ label, value, valueClassName, note }: { label: string; value: string | number; valueClassName?: string; note?: string }) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClassName ?? "text-amber-400"}`}>{value}</p>
      {note && <p className="text-[10px] text-gray-500 mt-1">{note}</p>}
    </div>
  );
}

export default function CollectionStatsPanel({ stats }: CollectionStatsPanelProps) {
  const missingPriceCount = stats.missingPriceCount ?? 0;

  return (
    <div className="p-3 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Unique Cards" value={stats.totalUnique} />
        <StatCard label="Total Cards" value={stats.totalCards} />
        <StatCard
          label="Total Value"
          value={currencyFormatter.format(stats.totalValue ?? 0)}
          valueClassName="text-emerald-400"
          note={
            missingPriceCount > 0
              ? `Excludes ${missingPriceCount} card${missingPriceCount === 1 ? "" : "s"} missing market price`
              : undefined
          }
        />
      </div>

      {missingPriceCount > 0 && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">
          {missingPriceCount} owned card{missingPriceCount === 1 ? "" : "s"} could not be included in the estimated value because market prices are unavailable.
        </div>
      )}

      <CollectionSetBreakdown sets={stats.setBreakdown} />
    </div>
  );
}
