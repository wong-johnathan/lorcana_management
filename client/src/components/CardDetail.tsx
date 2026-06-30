import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Card, CardAnalysis } from "../types";
import { analysis as analysisApi } from "../services/api";

interface CardDetailProps {
  card: Card;
  onClose: () => void;
  onAdd?: (cardId: string, quantity: number, foilQuantity: number) => void;
  currentQuantity?: { quantity: number; foilQuantity: number };
}

export default function CardDetail({
  card,
  onClose,
  onAdd,
  currentQuantity,
}: CardDetailProps) {
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState("1");
  const [foilQuantity, setFoilQuantity] = useState("0");
  const [added, setAdded] = useState(false);
  const [analysisData, setAnalysisData] = useState<CardAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const isLoggedIn = !!localStorage.getItem("token");

  const fetchAnalysis = useCallback(async () => {
    try {
      const data = await analysisApi.get(card.id);
      setAnalysisData(data);
    } catch {
      setAnalysisData(null);
    }
  }, [card.id]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Poll when pending
  useEffect(() => {
    if (analysisData?.status !== "pending") return;
    const interval = setInterval(fetchAnalysis, 3000);
    return () => clearInterval(interval);
  }, [analysisData?.status, fetchAnalysis]);

  const handleAnalyze = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      await analysisApi.analyze(card.id);
      setAnalysisData({ summary: null, lastSold: null, currentAverage: null, fullAnalysis: null, investmentScore: null, investmentTier: null, pillarScores: null, status: "pending", createdAt: "", updatedAt: "" });
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to start analysis");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const shortNumber = card.cardNumber.split("•")[0]?.trim() || card.cardNumber;

  const qtyNum = parseInt(quantity) || 0;
  const foilNum = parseInt(foilQuantity) || 0;

  const handleAdd = () => {
    if (onAdd && (qtyNum > 0 || foilNum > 0)) {
      onAdd(card.id, qtyNum, foilNum);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start p-4 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold">{card.name}</h2>
            {card.subtitle && (
              <p className="text-gray-400">{card.subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 flex flex-col md:flex-row gap-4">
          <div className="md:w-1/2">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="w-full aspect-[2/3] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
                No image
              </div>
            )}
          </div>

          <div className="md:w-1/2 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Color</span>
                <p className="font-medium">{card.color}</p>
              </div>
              <div>
                <span className="text-gray-500">Set</span>
                <p className="font-medium">{card.setName}</p>
              </div>
              <div>
                <span className="text-gray-500">Rarity</span>
                <p className="font-medium">{card.rarity}</p>
              </div>
              <div>
                <span className="text-gray-500">Ink Cost</span>
                <p className="font-medium">{card.inkCost}</p>
              </div>
              <div>
                <span className="text-gray-500">Strength</span>
                <p className="font-medium">{card.strength}</p>
              </div>
              <div>
                <span className="text-gray-500">Willpower</span>
                <p className="font-medium">{card.willpower}</p>
              </div>
              {card.lore > 0 && (
                <div>
                  <span className="text-gray-500">Lore</span>
                  <p className="font-medium">{card.lore}</p>
                </div>
              )}
              <div>
                <span className="text-gray-500">Card #</span>
                <p className="font-medium">{card.cardNumber}</p>
              </div>
            </div>

            {card.types.length > 0 && (
              <div>
                <span className="text-gray-500 text-sm">Types</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {card.types.map((t) => (
                    <span
                      key={t}
                      className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {card.cardType && (
              <div>
                <span className="text-gray-500 text-sm">Card Type</span>
                <p className="text-sm font-medium">{card.cardType}</p>
              </div>
            )}

            {card.abilities && (
              <div>
                <span className="text-gray-500 text-sm">Abilities</span>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {card.abilities}
                </p>
              </div>
            )}

            {/* Market links */}
            <div className="space-y-1.5 pt-1">
              <div className="flex gap-2">
                <a
                  href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}&LH_Sold=1&LH_Complete=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs bg-green-700/30 hover:bg-green-700/50 text-green-400 border border-green-700/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  💰 Sold
                </a>
                <a
                  href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs bg-blue-700/30 hover:bg-blue-700/50 text-blue-400 border border-blue-700/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  🛒 Active
                </a>
                <a
                  href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}&_sacat=0&_from=R40&rt=nc&LH_Auction=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center text-xs bg-amber-700/30 hover:bg-amber-700/50 text-amber-400 border border-amber-700/50 rounded-md px-2 py-1.5 transition-colors"
                >
                  🔨 Auction
                </a>
              </div>
              <a
                href={`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(`${card.name} - ${card.subtitle}`)}&view=grid`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border border-purple-700/50 rounded-md px-3 py-1.5 transition-colors"
              >
                📊 TCGPlayer
              </a>
              <a
                href={`https://www.facebook.com/search/top?q=${encodeURIComponent(`${card.name} - ${card.subtitle}`)}&filters=${encodeURIComponent(btoa(JSON.stringify({"recent_posts:0": JSON.stringify({ name: "recent_posts", args: "" })})))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs bg-sky-700/30 hover:bg-sky-700/50 text-sky-400 border border-sky-700/50 rounded-md px-3 py-1.5 transition-colors"
              >
                📘 Facebook
              </a>
            </div>

            {/* AI Market Analysis */}
            <div className="border-t border-gray-700 pt-3 mt-2">
              {!analysisData && !analysisLoading && (
                <div className="text-center">
                  {isLoggedIn ? (
                    <button
                      onClick={handleAnalyze}
                      disabled={analysisLoading}
                      className="w-full text-xs bg-indigo-700/30 hover:bg-indigo-700/50 text-indigo-300 border border-indigo-700/50 rounded-md px-3 py-2 transition-colors disabled:opacity-50"
                    >
                      🤖 Analyze Market Price with AI
                    </button>
                  ) : (
                    <p className="text-xs text-gray-500 text-center">
                      🤖 AI market analysis available — <a href="/login" className="text-indigo-400 hover:underline">log in</a> to analyze
                    </p>
                  )}
                </div>
              )}

              {analysisLoading && (
                <div className="text-center py-3">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-indigo-400 border-t-transparent"></div>
                  <p className="text-xs text-gray-400 mt-1">Starting analysis...</p>
                </div>
              )}

              {analysisError && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-md p-2">
                  <p className="text-xs text-red-400">{analysisError}</p>
                  <button
                    onClick={handleAnalyze}
                    className="text-xs text-red-300 hover:underline mt-1"
                  >
                    Retry
                  </button>
                </div>
              )}

              {analysisData?.status === "pending" && (
                <div className="text-center py-3">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-indigo-400 border-t-transparent"></div>
                  <p className="text-xs text-indigo-400 mt-1">DeepSeek is analyzing this card...</p>
                </div>
              )}

              {analysisData?.status === "completed" && (analysisData.fullAnalysis || analysisData.summary) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">
                      🤖 AI Analysis · {formatTimeAgo(analysisData.updatedAt)}
                    </span>
                    {isLoggedIn && (
                      <button
                        onClick={handleAnalyze}
                        disabled={analysisLoading}
                        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                      >
                        🔄 Re-analyze
                      </button>
                    )}
                  </div>

                  {/* Fixed summary fields */}
                  <div className="space-y-1.5 mb-2">
                    {analysisData.summary && (
                      <div className="bg-gray-800/50 rounded-md p-2">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Summary</span>
                        <p className="text-xs text-gray-300 mt-0.5">{analysisData.summary}</p>
                      </div>
                    )}
                    {analysisData.lastSold && (
                      <div className="flex justify-between text-xs bg-gray-800/50 rounded-md p-2">
                        <span className="text-gray-500">Last Sold</span>
                        <span className="text-gray-200 font-medium">{analysisData.lastSold}</span>
                      </div>
                    )}
                    {analysisData.currentAverage && (
                      <div className="flex justify-between text-xs bg-gray-800/50 rounded-md p-2">
                        <span className="text-gray-500">Current Avg</span>
                        <span className="text-gray-200 font-medium">{analysisData.currentAverage}</span>
                      </div>
                    )}
                  </div>

                  {/* LCIF Investment Score - compact */}
                  {analysisData.investmentScore != null && (
                    <div className="flex items-center justify-between text-xs bg-gray-800/50 rounded-md p-2">
                      <span className="text-gray-500">LCIF Score</span>
                      <span className="font-medium">
                        <span className="text-white">{analysisData.investmentScore}/100</span>
                        {analysisData.investmentTier && (
                          <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            analysisData.investmentTier === "S-Grade" ? "bg-yellow-700/50 text-yellow-300" :
                            analysisData.investmentTier === "A-Grade" ? "bg-green-700/50 text-green-300" :
                            analysisData.investmentTier === "B-Grade" ? "bg-blue-700/50 text-blue-300" :
                            "bg-gray-700/50 text-gray-300"
                          }`}>{analysisData.investmentTier}</span>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Link to full detail page */}
                  <button
                    onClick={() => { onClose(); navigate(`/database/${card.id}`); }}
                    className="w-full text-xs text-indigo-400 hover:text-indigo-300 py-1.5 border border-indigo-800/50 rounded-md bg-indigo-900/20 hover:bg-indigo-900/30 transition-colors"
                  >
                    View full analysis →
                  </button>
                </div>
              )}

              {analysisData?.status === "error" && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-md p-2">
                  <p className="text-xs text-red-400">Analysis failed</p>
                  {isLoggedIn && (
                    <button
                      onClick={handleAnalyze}
                      className="text-xs text-red-300 hover:underline mt-1"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {currentQuantity && (
              <div className="bg-gray-800 rounded-md p-2 text-sm">
                <span className="text-gray-400">In your collection: </span>
                <span className="font-medium">
                  {currentQuantity.quantity} normal
                  {currentQuantity.foilQuantity > 0 &&
                    `, ${currentQuantity.foilQuantity} foil`}
                </span>
              </div>
            )}

            {onAdd && (
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">
                      Normal qty
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onBlur={() => setQuantity(String(qtyNum))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">
                      Foil qty
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={foilQuantity}
                      onChange={(e) => setFoilQuantity(e.target.value)}
                      onBlur={() => setFoilQuantity(String(foilNum))}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAdd}
                  disabled={qtyNum === 0 && foilNum === 0}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold py-2 rounded-md transition-colors"
                >
                  {added ? "Added!" : "Add to Inventory"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
