import { Link } from "react-router-dom";
import type { MarketplaceCardResult } from "../../types";
import { cardIdentifier, cardTitle, formatMarketplaceMoney } from "./marketplaceDisplay";

interface MarketplaceCardResultProps {
  result: MarketplaceCardResult;
}

export default function MarketplaceCardResult({ result }: MarketplaceCardResultProps) {
  return (
    <article className="rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm">
      <div className="flex gap-4">
        <img
          src={result.card.imageUrl}
          alt={cardTitle(result.card)}
          className="h-32 w-24 rounded-lg object-cover bg-gray-800"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-100">{cardTitle(result.card)}</h3>
            <p className="text-sm text-gray-400">{cardIdentifier(result.card, result.variant)}</p>
          </div>
          <p className="text-sm font-medium text-amber-300">
            {result.offersCount} available seller{result.offersCount === 1 ? "" : "s"} • From {formatMarketplaceMoney(result.lowestPrice)}
          </p>
          {result.approximateConvertedPrice && (
            <p className="text-sm text-gray-400">≈ {formatMarketplaceMoney(result.approximateConvertedPrice)}</p>
          )}
          <Link
            to={`/marketplace/card/${result.card.id}`}
            className="inline-flex rounded bg-amber-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400"
          >
            Compare offers
          </Link>
        </div>
      </div>
    </article>
  );
}
