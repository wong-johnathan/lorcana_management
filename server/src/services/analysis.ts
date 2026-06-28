
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
Provide a deep, comprehensive market analysis covering ALL of the following:

### 1. Estimated Market Price Range
Based on the search results and your knowledge, estimate the current price range for this card (raw/non-foil and foil if applicable). If exact prices are found in the search data, cite them. Otherwise, provide a well-reasoned estimate based on comparable cards.

### 2. Price Trend
Is this card's value rising, falling, or stable? What's driving the trend?

### 3. Value Drivers
Analyze the factors affecting this card's market value:
- **Rarity & Scarcity:** How rare is it? Print run context.
- **Meta Relevance:** Is it played in competitive decks? Which archetypes?
- **Collectibility:** Character popularity, art appeal, enchanted/alternate art potential.
- **Set Context:** Where does this set sit in the meta? Is it still in print?

### 4. Competitive Viability
How does this card perform in the current competitive meta? What decks use it? Is it a staple or niche?

### 5. Investment Outlook
Short-term (3-6 months) and long-term (1-2 years) outlook. Is this a hold, buy, or sell?

### 6. Comparable Cards
What other cards in the same color/rarity/cost bracket serve as price references?

Format your response in clear sections with markdown headers. Be specific, cite sources from the search results when possible, and provide dollar ranges rather than vague statements. If the search results contain specific prices, ALWAYS include them. End with a one-sentence verdict.`;

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
        { role: "system", content: "You are an expert Lorcana TCG market analyst. You provide detailed, specific, and well-reasoned market analysis. You always cite prices when available and give dollar ranges, not vague statements. Respond in well-structured markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 2500,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!deepseekRes.ok) {
    const errText = await deepseekRes.text();
    throw new Error(`DeepSeek API error ${deepseekRes.status}: ${errText.slice(0, 200)}`);
  }

  const data = await deepseekRes.json() as any;
  const analysis = data.choices?.[0]?.message?.content;

  if (!analysis) {
    throw new Error("DeepSeek returned empty response");
  }

  return analysis;
}
