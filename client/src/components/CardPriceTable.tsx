import type { CardPrice } from "../types";
import { formatTimeAgo } from "../utils/format";

interface CardPriceTableProps {
  prices: CardPrice[];
  compact?: boolean;
}

function fmt(value: number | null): string {
  return value != null ? `$${value.toFixed(2)}` : "—";
}

export default function CardPriceTable({ prices, compact }: CardPriceTableProps) {
  if (prices.length === 0) return null;

  const sorted = [...prices].sort((a, b) =>
    a.variant === "Normal" ? -1 : b.variant === "Normal" ? 1 : 0
  );
  const cellPad = compact ? "px-2 py-1" : "px-3 py-2";
  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
      <table className={`w-full ${textSize}`}>
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-700/50">
            <th className={`text-left ${cellPad} font-medium`}>Variant</th>
            <th className={`text-right ${cellPad} font-medium`}>Low</th>
            <th className={`text-right ${cellPad} font-medium`}>Market</th>
            <th className={`text-right ${cellPad} font-medium`}>High</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.variant} className="border-b border-gray-800 last:border-0">
              <td className={`${cellPad} text-gray-300`}>{p.variant}</td>
              <td className={`${cellPad} text-right text-gray-500`}>{fmt(p.lowPrice)}</td>
              <td className={`${cellPad} text-right font-semibold text-emerald-400`}>{fmt(p.marketPrice)}</td>
              <td className={`${cellPad} text-right text-gray-500`}>{fmt(p.highPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`${cellPad} text-[10px] text-gray-600 border-t border-gray-700/50`}>
        Updated {formatTimeAgo(sorted[0].updatedAt)}
      </div>
    </div>
  );
}
