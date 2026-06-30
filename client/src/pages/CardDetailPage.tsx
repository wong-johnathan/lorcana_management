import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Card, CardAnalysis } from "../types";
import { cards as cardsApi, analysis as analysisApi } from "../services/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function CardDetailPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<CardAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const isLoggedIn = !!localStorage.getItem("token");

  useEffect(() => {
    if (!cardId) return;
    cardsApi.get(cardId).then(setCard).catch(() => setCard(null)).finally(() => setLoading(false));
  }, [cardId]);

  const fetchAnalysis = useCallback(async () => {
    if (!cardId) return;
    try {
      const data = await analysisApi.get(cardId);
      setAnalysisData(data);
    } catch {
      setAnalysisData(null);
    }
  }, [cardId]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  useEffect(() => {
    if (analysisData?.status !== "pending") return;
    const interval = setInterval(fetchAnalysis, 3000);
    return () => clearInterval(interval);
  }, [analysisData?.status, fetchAnalysis]);

  const handleAnalyze = async () => {
    if (!cardId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      await analysisApi.analyze(cardId);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-gray-400">Card not found</p>
        <button onClick={() => navigate("/database")} className="text-indigo-400 hover:underline text-sm">Back to database</button>
      </div>
    );
  }

  const shortNumber = card.cardNumber.split("•")[0]?.trim() || card.cardNumber;

  const tierColor = (tier: string | null) => {
    if (tier === "S-Grade") return { bg: "bg-yellow-900/30", border: "border-yellow-600/50", badge: "bg-yellow-700/50 text-yellow-300", bar: "bg-yellow-400" };
    if (tier === "A-Grade") return { bg: "bg-green-900/30", border: "border-green-600/50", badge: "bg-green-700/50 text-green-300", bar: "bg-green-400" };
    if (tier === "B-Grade") return { bg: "bg-blue-900/30", border: "border-blue-600/50", badge: "bg-blue-700/50 text-blue-300", bar: "bg-blue-400" };
    return { bg: "bg-gray-800/50", border: "border-gray-600/50", badge: "bg-gray-700/50 text-gray-300", bar: "bg-gray-400" };
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back button */}
      <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">
        ← Back
      </button>

      {/* Card header + info */}
      <div className="flex flex-col md:flex-row gap-6 mb-8">
        <div className="md:w-1/3 shrink-0">
          {card.imageUrl ? (
            <img src={card.imageUrl} alt={card.name} className="w-full rounded-xl shadow-lg" />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-800 rounded-xl flex items-center justify-center text-gray-500">No image</div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{card.name}</h1>
            {card.subtitle && <p className="text-lg text-gray-400">{card.subtitle}</p>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Color</span>
              <p className="font-medium">{card.color}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Set</span>
              <p className="font-medium">{card.setName}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Rarity</span>
              <p className="font-medium">{card.rarity}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Ink Cost</span>
              <p className="font-medium">{card.inkCost}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Strength</span>
              <p className="font-medium">{card.strength}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Willpower</span>
              <p className="font-medium">{card.willpower}</p>
            </div>
            {card.lore > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <span className="text-gray-500 text-xs block">Lore</span>
                <p className="font-medium">{card.lore}</p>
              </div>
            )}
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-500 text-xs block">Card #</span>
              <p className="font-medium">{card.cardNumber}</p>
            </div>
          </div>

          {card.types.length > 0 && (
            <div>
              <span className="text-gray-500 text-xs block mb-1">Types</span>
              <div className="flex flex-wrap gap-1.5">
                {card.types.map((t) => (
                  <span key={t} className="text-xs bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}

          {card.cardType && (
            <div>
              <span className="text-gray-500 text-xs block">Card Type</span>
              <p className="text-sm font-medium">{card.cardType}</p>
            </div>
          )}

          {card.abilities && (
            <div>
              <span className="text-gray-500 text-xs block mb-1">Abilities</span>
              <p className="text-sm whitespace-pre-wrap bg-gray-800/30 rounded-lg p-3">{card.abilities}</p>
            </div>
          )}

          {/* Market links */}
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}&LH_Sold=1&LH_Complete=1`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs bg-green-700/30 hover:bg-green-700/50 text-green-400 border border-green-700/50 rounded-md px-3 py-1.5 transition-colors"
            >eBay Sold</a>
            <a
              href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs bg-blue-700/30 hover:bg-blue-700/50 text-blue-400 border border-blue-700/50 rounded-md px-3 py-1.5 transition-colors"
            >eBay Active</a>
            <a
              href={`https://www.ebay.com.sg/sch/i.html?_nkw=${encodeURIComponent(`${card.name} - ${card.subtitle} - ${shortNumber}`)}&_sacat=0&_from=R40&rt=nc&LH_Auction=1`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs bg-amber-700/30 hover:bg-amber-700/50 text-amber-400 border border-amber-700/50 rounded-md px-3 py-1.5 transition-colors"
            >eBay Auction</a>
            <a
              href={`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(`${card.name} - ${card.subtitle}`)}&view=grid`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border border-purple-700/50 rounded-md px-3 py-1.5 transition-colors"
            >TCGPlayer</a>
          </div>
        </div>
      </div>

      {/* AI Analysis Section */}
      <div className="border-t border-gray-800 pt-6">
        <h2 className="text-lg font-semibold mb-4">AI Market Analysis</h2>

        {/* No analysis yet */}
        {!analysisData && !analysisLoading && (
          <div className="text-center py-8 bg-gray-800/20 rounded-xl border border-gray-800">
            {isLoggedIn ? (
              <div>
                <p className="text-gray-400 text-sm mb-3">No analysis available for this card yet.</p>
                <button onClick={handleAnalyze} className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors">
                  Analyze with AI
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                AI market analysis available — <a href="/login" className="text-indigo-400 hover:underline">log in</a> to analyze
              </p>
            )}
          </div>
        )}

        {analysisLoading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-400 border-t-transparent"></div>
            <p className="text-sm text-gray-400 mt-2">Starting analysis...</p>
          </div>
        )}

        {analysisError && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <p className="text-sm text-red-400">{analysisError}</p>
            <button onClick={handleAnalyze} className="text-sm text-red-300 hover:underline mt-2">Retry</button>
          </div>
        )}

        {analysisData?.status === "pending" && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-400 border-t-transparent"></div>
            <p className="text-sm text-indigo-400 mt-2">DeepSeek is analyzing this card...</p>
          </div>
        )}

        {analysisData?.status === "completed" && (analysisData.fullAnalysis || analysisData.summary) && (
          <div className="space-y-6">
            {/* Timestamp + re-analyze */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Last analyzed {formatTimeAgo(analysisData.updatedAt)}</span>
              {isLoggedIn && (
                <button onClick={handleAnalyze} disabled={analysisLoading} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50">
                  Re-analyze
                </button>
              )}
            </div>

            {/* Summary + prices row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {analysisData.summary && (
                <div className="md:col-span-3 bg-gray-800/50 rounded-lg p-4">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">Summary</span>
                  <p className="text-sm text-gray-300 mt-1">{analysisData.summary}</p>
                </div>
              )}
              {analysisData.lastSold && (
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">Last Sold</span>
                  <p className="text-sm text-gray-200 font-medium mt-1">{analysisData.lastSold}</p>
                </div>
              )}
              {analysisData.currentAverage && (
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">Current Average</span>
                  <p className="text-sm text-gray-200 font-medium mt-1">{analysisData.currentAverage}</p>
                </div>
              )}
              {analysisData.investmentScore != null && (
                <div className={`rounded-lg p-4 border ${tierColor(analysisData.investmentTier).bg} ${tierColor(analysisData.investmentTier).border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400">LCIF Score</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${tierColor(analysisData.investmentTier).badge}`}>{analysisData.investmentTier}</span>
                  </div>
                  <div className="flex items-end gap-2 mb-3">
                    <span className="text-3xl font-bold text-white">{analysisData.investmentScore}</span>
                    <span className="text-sm text-gray-500 mb-0.5">/ 100</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full ${tierColor(analysisData.investmentTier).bar}`} style={{ width: `${analysisData.investmentScore}%` }}></div>
                  </div>
                  {analysisData.pillarScores && (
                    <div className="space-y-1.5">
                      {analysisData.pillarScores.map((p) => (
                        <div key={p.name} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 w-28 shrink-0 truncate" title={p.name}>{p.name}</span>
                          <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                            <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${(p.score / p.maxScore) * 100}%` }}></div>
                          </div>
                          <span className="text-gray-300 w-12 text-right">{p.score}/{p.maxScore}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Full analysis */}
            {analysisData.fullAnalysis && (
              <div className="bg-gray-800/30 rounded-xl p-6 prose prose-invert prose-sm max-w-none
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-indigo-300 [&_h2]:mt-6 [&_h2]:mb-2
                [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-indigo-200 [&_h3]:mt-4 [&_h3]:mb-1
                [&_strong]:text-gray-200
                [&_ul]:pl-4 [&_ol]:pl-4
                [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse
                [&_th]:bg-gray-700/50 [&_th]:p-2 [&_th]:text-left [&_th]:border [&_th]:border-gray-600
                [&_td]:p-2 [&_td]:border [&_td]:border-gray-700
                [&_p]:mb-2 [&_p]:text-gray-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {analysisData.fullAnalysis}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {analysisData?.status === "error" && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
            <p className="text-sm text-red-400">Analysis failed</p>
            {isLoggedIn && (
              <button onClick={handleAnalyze} className="text-sm text-red-300 hover:underline mt-2">Retry</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
