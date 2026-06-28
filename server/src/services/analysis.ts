
const SEARXNG_URL = process.env.SEARXNG_URL || "http://searxng:8080";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export async function searchSearxNG(query: string): Promise<SearchResult[]> {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "LorcanaApp/1.0" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(`SearXNG returned ${res.status}`);
    return [];
  }

  const html = await res.text();
  return parseSearxNGResults(html);
}

function parseSearxNGResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract <article> blocks — SearXNG simple theme uses article.result
  const articleRegex = /<article[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  const articles = html.matchAll(articleRegex);

  for (const match of articles) {
    const block = match[1];

    // Extract title + URL from the heading link
    const linkMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*class="[^"]*url_header[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<h\d[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);

    // Extract content snippet
    const contentMatch = block.match(/<p[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/<span[^>]*class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/span>/i);

    if (linkMatch) {
      const url = linkMatch[1];
      const title = stripHtml(linkMatch[2]).trim();
      const content = contentMatch ? stripHtml(contentMatch[1]).trim() : "";

      if (title && url) {
        results.push({ title, url, content });
      }
    }
  }

  // Fallback: extract linked headings and content from any result structure
  if (results.length === 0) {
    const titlePattern = /<h\d[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const titles = html.matchAll(titlePattern);

    for (const m of titles) {
      const url = m[1];
      const title = stripHtml(m[2]).trim();
      if (title && url && !title.includes("SearXNG") && url.startsWith("http")) {
        results.push({ title, url, content: "" });
      }
    }
  }

  return results.slice(0, 15);
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").trim();
}

export interface AnalysisResult {
  summary: string;
  lastSold: string;
  currentAverage: string;
  fullAnalysis: string;
}

export async function analyzeCardMarket(
  card: { name: string; subtitle: string; color: string; rarity: string; setName: string; inkCost: number; cardType: string; types: string[]; abilities: string }
): Promise<string> {
  // 1. Search for market data
  const searchQuery = `${card.name} ${card.subtitle} lorcana market price 2026`;
  const searchResults = await searchSearxNG(searchQuery);

  // 2. Build the prompt
  const searchContext = searchResults.length > 0
    ? searchResults.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.content}`).join("\n\n")
    : "No current market data found from web search.";

  const prompt = `You are a Lorcana TCG market analyst. Analyze the market value of this specific card using the provided card metadata and current web search results.

## Card Details
- **Name:** ${card.name}${card.subtitle ? ` - ${card.subtitle}` : ""}
- **Color/Ink:** ${card.color}
- **Rarity:** ${card.rarity}
- **Set:** ${card.setName}
- **Ink Cost:** ${card.inkCost}
- **Card Type:** ${card.cardType || "N/A"}
- **Types:** ${card.types.join(", ") || "N/A"}
- **Abilities:** ${card.abilities || "None"}

## Current Market Data (from web search)
${searchContext}

## Instructions
You MUST return a valid JSON object with exactly these fields. No other text outside the JSON.

{
  "summary": "2-3 sentence executive summary of the card's market position, key price point, and trend",
  "lastSold": "Most recent confirmed sale price with date/context (e.g. '$92.70 — June 2026 eBay sold listing'). If no specific sale found, use 'N/A — no recent confirmed sales found'",
  "currentAverage": "Current estimated market price range (e.g. '$90–95' for raw, '$200–250' for foil). If no data, use 'N/A — insufficient data'",
  "fullAnalysis": "Full detailed markdown analysis covering:\n\n### 1. Estimated Market Price Range\nBased on search results and knowledge, estimate current price range. Cite specific sources when available.\n\n### 2. Price Trend\nRising, falling, or stable? What's driving it?\n\n### 3. Value Drivers\n- Rarity & scarcity\n- Meta relevance (competitive decks, archetypes)\n- Collectibility (character popularity, art appeal)\n- Set context (in print? out of print?)\n\n### 4. Competitive Viability\nWhere does this card fit in the current meta? Staple or niche?\n\n### 5. Investment Outlook\nShort-term (3-6 months) and long-term (1-2 years). Hold, buy, or sell?\n\n### 6. Comparable Cards\nTable format: | Card | Set | Rarity | Current Price | Notes |\n\nEnd with a one-sentence verdict.\n\nUse dollar ranges, cite sources, be specific."
}

CRITICAL: The fullAnalysis field must contain well-structured markdown with proper headers (##), tables, and formatting. The summary, lastSold, and currentAverage fields are plain text — no markdown in them.`;

  // 3. Call DeepSeek
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY not configured");
  }

  const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are an expert Lorcana TCG market analyst. You provide detailed, specific, and well-reasoned market analysis. You always cite prices when available and give dollar ranges, not vague statements. You respond exclusively in valid JSON — no markdown, no commentary outside the JSON object." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!deepseekRes.ok) {
    const errText = await deepseekRes.text();
    throw new Error(`DeepSeek API error ${deepseekRes.status}: ${errText.slice(0, 200)}`);
  }

  const data = await deepseekRes.json() as any;
  const raw = data.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("DeepSeek returned empty response");
  }

  // Parse and validate the JSON
  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: treat the entire response as fullAnalysis
    return JSON.stringify({
      summary: "Analysis completed — tap to view details",
      lastSold: "See full analysis",
      currentAverage: "See full analysis",
      fullAnalysis: raw,
    });
  }

  // Validate required fields
  return JSON.stringify({
    summary: parsed.summary || "Analysis completed",
    lastSold: parsed.lastSold || "No data available",
    currentAverage: parsed.currentAverage || "No data available",
    fullAnalysis: parsed.fullAnalysis || raw,
  });
}
