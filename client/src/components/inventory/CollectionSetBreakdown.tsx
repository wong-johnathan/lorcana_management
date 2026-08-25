interface SetBreakdownItem {
  setName: string;
  owned: number;
  total: number;
}

interface CollectionSetBreakdownProps {
  sets: SetBreakdownItem[];
}

export default function CollectionSetBreakdown({ sets }: CollectionSetBreakdownProps) {
  if (sets.length === 0) return null;

  return (
    <section className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">Set Breakdown</h3>
      <div className="space-y-3">
        {sets.map((set) => {
          const percentage = set.total > 0 ? Math.min(100, Math.round((set.owned / set.total) * 100)) : 0;
          return (
            <div key={set.setName}>
              <div className="flex items-center justify-between gap-3 text-sm mb-1">
                <span className="text-gray-300 truncate">{set.setName}</span>
                <span className="text-gray-400 shrink-0">
                  <span className="text-amber-300 font-semibold">{`${set.owned}/${set.total}`}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden" aria-label={`${set.setName} completion ${percentage}%`}>
                <div className="h-full bg-amber-500" style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
