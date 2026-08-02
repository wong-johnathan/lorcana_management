// components/ScanOverlay.tsx
import type { ScanStatus } from "../services/types";

interface Props {
  status: ScanStatus;
  metrics?: { edgeDensity: number; diffFromLast: number } | null;
}

export default function ScanOverlay({ status, metrics }: Props) {
  return (
    <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
      <div className="bg-gradient-to-t from-black/80 to-transparent pt-8 pb-3 px-3">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${bgForPhase(status.phase)}`}>
          {status.phase === "recognizing" && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <span>{labelForPhase(status)}</span>
        </div>
        {metrics && (status.phase === "waiting" || status.phase === "stabilizing") && (
          <div className="mt-1 text-xs text-gray-500">
            edges: {(metrics.edgeDensity * 100).toFixed(1)}% · diff: {(metrics.diffFromLast * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

function bgForPhase(phase: string): string {
  switch (phase) {
    case "waiting": return "bg-gray-800/80 text-gray-400";
    case "stabilizing": return "bg-amber-900/60 text-amber-300";
    case "recognizing": return "bg-blue-900/60 text-blue-300";
    case "result": return "bg-green-900/60 text-green-300";
    case "duplicate": return "bg-yellow-900/60 text-yellow-300";
    case "no_match": return "bg-red-900/40 text-red-300";
    case "error": return "bg-red-900/60 text-red-300";
    default: return "bg-gray-800/80 text-gray-400";
  }
}

function labelForPhase(status: ScanStatus): string {
  switch (status.phase) {
    case "waiting": return "Show a card to the camera";
    case "stabilizing": return "Hold steady...";
    case "recognizing": return "Reading card...";
    case "result": return "Card found!";
    case "duplicate": return `Already scanned${status.existing ? ` (x${status.existing.quantity})` : ""}`;
    case "no_match": return "No card detected — try again";
    case "error": return status.message || "Something went wrong";
  }
}
