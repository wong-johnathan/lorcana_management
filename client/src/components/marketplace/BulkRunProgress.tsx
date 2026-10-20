interface BulkRunProgressProps {
  /** Items finished so far. */
  current: number;
  /** Items in this run (a retry counts only the failed items). */
  total: number;
  /** "Last: Elsa · TFC · 42 — created" liveness line (not a live region). */
  lastLine: string | null;
}

/**
 * Determinate run progress (REQ-BULK-7.2, UI C-16). The bar is never the only
 * signal: the count line, the percentage and `aria-valuetext` all carry it.
 */
export default function BulkRunProgress({ current, total, lastLine }: BulkRunProgressProps) {
  const percent = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-100 tabular-nums">
        {`Creating ${current} of ${total} listings…`}
      </p>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={current}
          aria-valuetext={`Creating ${current} of ${total} listings`}
          className="h-2 w-full overflow-hidden rounded-full bg-gray-800"
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-200 ease-linear motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="min-w-[3ch] text-right text-xs text-gray-400 tabular-nums">{`${percent}%`}</span>
      </div>
      {lastLine ? (
        <p className="truncate text-xs text-gray-400" title={lastLine}>
          {lastLine}
        </p>
      ) : null}
      <p className="max-w-[70ch] text-xs text-gray-400">
        Keep this tab open until it finishes. Leaving stops the remaining cards; anything already
        created stays in Your listings.
      </p>
    </div>
  );
}
