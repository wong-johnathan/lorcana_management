
const SEARXNG_URL = process.env.SEARXNG_URL || "http://searxng:8080";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface PriceData {
  source: string;        // "eBay", "TCGPlayer", "PriceCharting"
  url: string;
  prices: string[];      // extracted dollar amounts or price strings
  rawSnippet: string;    // original snippet for context
}

// ── SearXNG HTML search + parse ──────────────────────────────────────────

async function searchSearxNG(query: string): Promise<SearchResult[]> {
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

  const articleRegex = /<article[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  const articles = html.matchAll(articleRegex);

  for (const match of articles) {
    const block = match[1];

    const linkMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*class="[^"]*url_header[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<h\d[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);

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

  // Fallback
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

// ── Price extraction from search snippets ────────────────────────────────

function extractPricesFromSnippet(snippet: string): string[] {
  const prices: string[] = [];

  // Match dollar amounts: $X.XX, $X, $X.XX-$Y.YY, $X.XX – $Y.YY, $X,XXX.XX
  const dollarPattern = /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:–|—|-|to)\s*\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)?/g;
  const matches = snippet.match(dollarPattern);
  if (matches) {
    for (const m of matches) {
      const cleaned = m.replace(/\s+/g, " ").trim();
      if (!prices.includes(cleaned)) {
        prices.push(cleaned);
      }
    }
  }

  return prices.slice(0, 8); // cap at 8 prices per source
}

// ── Variant disambiguation ────────────────────────────────────────────────

const PROMO_VARIANT_KEYWORDS = [
  /promo/i, /challenge/i, /dlc\s/i, /prize/i, /\b\d+\/C\d*\b/i, /\b\dc\d\b/i,
  /enchanted/i, /palace\s*heist/i, /top\s*prize/i,
];

function isCardPromo(cardNumber: string, setName: string): boolean {
  // A card is a promo if it has a C-prefixed number (6/C2) or is in a Promo set
  const shortNumber = cardNumber.split("•")[0]?.trim() || cardNumber;
  if (/\/C\d/i.test(shortNumber)) return true;
  if (/promo|challenge/i.test(setName)) return true;
  return false;
}

function isDifferentVariant(
  snippet: string,
  title: string,
  cardNumber: string,
  cardIsPromo: boolean
): boolean {
  const shortNumber = cardNumber.split("•")[0]?.trim() || cardNumber;
  const numberPart = shortNumber.split("/")[0]?.trim(); // "69" or "6"

  // If the snippet/title explicitly contains our exact card number, it's our variant
  if (numberPart && shortNumber.length > 1) {
    // Match the full short number like "69/204" or "6/C2"
    const escapedNum = shortNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escapedNum, 'i').test(`${title} ${snippet}`)) {
      return false;
    }
  }

  // If the card IS a promo, do NOT filter out promo results — we want them
  if (cardIsPromo) return false;

  // Card is NOT a promo — filter out any snippet that references promo/challenge/enchanted
  const combined = `${title} ${snippet}`;
  return PROMO_VARIANT_KEYWORDS.some(p => p.test(combined));
}

// ── Per-source targeted searches ─────────────────────────────────────────

async function searchSourcePrices(
  name: string,
  subtitle: string,
  cardNumber: string,
  setName: string,
  source: "ebay" | "tcgplayer" | "pricecharting",
  cardIsPromo: boolean
): Promise<PriceData | null> {
  // Build a targeted query that includes card number to disambiguate variants
  const shortNumber = cardNumber.split("•")[0]?.trim() || cardNumber;
  const fullName = `${name}${subtitle ? ` ${subtitle}` : ""}`;

  let query: string;
  switch (source) {
    case "ebay":
      // For promo cards, include "challenge" or "promo" in the search
      if (cardIsPromo) {
        query = `"${fullName}" "${shortNumber}" lorcana promo ebay sold`;
      } else {
        query = `"${fullName}" "${shortNumber}" lorcana ebay sold`;
      }
      break;
    case "tcgplayer":
      query = `"${fullName}" "${shortNumber}" lorcana tcgplayer price`;
      break;
    case "pricecharting":
      query = `"${fullName}" "${shortNumber}" lorcana pricecharting`;
      break;
  }

  console.log(`[analysis] Searching ${source}: ${query}`);
  const results = await searchSearxNG(query);

  if (results.length === 0) {
    console.log(`[analysis] No results for ${source}`);
    return null;
  }

  // Extract prices from the top 8 results, filtering out promo variants
  const allPrices: string[] = [];
  let bestSnippet = "";
  let bestUrl = "";

  for (const r of results.slice(0, 8)) {
    // Skip results that clearly refer to a different variant (promo/challenge/enchanted)
    if (isDifferentVariant(r.content, r.title, cardNumber, cardIsPromo)) {
      console.log(`[analysis] Skipping different variant: ${r.title.slice(0, 80)}`);
      continue;
    }

    const prices = extractPricesFromSnippet(r.content);
    if (prices.length > 0) {
      allPrices.push(...prices);
      if (!bestSnippet) {
        bestSnippet = r.content;
        bestUrl = r.url;
      }
    }
  }

  // Deduplicate prices
  const uniquePrices = [...new Set(allPrices)];

  return {
    source: source === "ebay" ? "eBay" : source === "tcgplayer" ? "TCGPlayer" : "PriceCharting",
    url: bestUrl || results[0]?.url || "",
    prices: uniquePrices,
    rawSnippet: bestSnippet || results[0]?.content || "(no price data in snippets)",
  };
}

// ── Build structured price section for the prompt ────────────────────────

function buildPriceSection(priceData: (PriceData | null)[]): string {
  const sections: string[] = [];

  for (const pd of priceData) {
    if (!pd) continue;

    let section = `**${pd.source}**`;
    if (pd.url) section += `\nURL: ${pd.url}`;

    if (pd.prices.length > 0) {
      section += `\nPrices found in search snippets: ${pd.prices.join(", ")}`;
    } else {
      section += `\nNo specific prices found in search snippets.`;
    }
    section += `\nSnippet: ${pd.rawSnippet.slice(0, 300)}`;

    sections.push(section);
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "No price data found from any source.";
}

// ── Main analysis function ───────────────────────────────────────────────

export interface AnalysisResult {
  summary: string;
  lastSold: string;
  currentAverage: string;
  fullAnalysis: string;
}

export async function analyzeCardMarket(
  card: {
    name: string;
    subtitle: string;
    color: string;
    rarity: string;
    setName: string;
    setCode: string;
    cardNumber: string;
    inkCost: number;
    cardType: string;
    types: string[];
    abilities: string;
  }
): Promise<string> {
  // 1. Determine if this card is a promo variant
  const cardIsPromo = isCardPromo(card.cardNumber, card.setName);

  // 2. Run 3 targeted searches in parallel
  const [ebayData, tcgData, pcData] = await Promise.all([
    searchSourcePrices(card.name, card.subtitle, card.cardNumber, card.setName, "ebay", cardIsPromo),
    searchSourcePrices(card.name, card.subtitle, card.cardNumber, card.setName, "tcgplayer", cardIsPromo),
    searchSourcePrices(card.name, card.subtitle, card.cardNumber, card.setName, "pricecharting", cardIsPromo),
  ]);

  const priceSection = buildPriceSection([ebayData, tcgData, pcData]);

  const shortNumber = card.cardNumber.split("•")[0]?.trim() || card.cardNumber;

  // 2. Build the prompt
  const prompt = `You are a Lorcana TCG market analyst. Analyze the market value of this EXACT card variant using the provided metadata and per-source price data.

## Card Identification (THIS SPECIFIC VARIANT ONLY)
- **Name:** ${card.name}${card.subtitle ? ` - ${card.subtitle}` : ""}
- **Card Number:** ${shortNumber}
- **Set:** ${card.setName} (code: ${card.setCode})
- **Color/Ink:** ${card.color}
- **Rarity:** ${card.rarity}
- **Ink Cost:** ${card.inkCost}
- **Card Type:** ${card.cardType || "N/A"}
- **Types:** ${card.types.join(", ") || "N/A"}
- **Abilities:** ${card.abilities || "None"}

## Real-Time Price Data (per-source web search)

${priceSection}

## CRITICAL INSTRUCTIONS

1. **ANALYZE ONLY THE CARD IDENTIFIED ABOVE.** Ignore prices for promo variants, challenge foil variants, enchanted editions, or any card with a different card number or set. If the search results mix regular and promo prices, use ONLY the prices that match the card number "${shortNumber}" and set "${card.setName}".

2. The prices extracted above come from current web search snippets (eBay sold listings, TCGPlayer market prices, PriceCharting). Use them as your primary data source.

3. For **lastSold**, use the most recent confirmed sale price from the eBay data if available. For **currentAverage**, synthesize the prices across all three sources into a realistic range.

4. You MUST return a valid JSON object with exactly these fields:

{
  "summary": "2-3 sentence executive summary: state the card's market price from the data above, note which variant you're analyzing, and mention the general trend",
  "lastSold": "Most recent confirmed sale price with source and date. Format: '$X.XX — [source], [date/context]'. If no specific sale found, use 'No recent confirmed sale found'",
  "currentAverage": "Current market price range synthesized from the 3 sources. Format: '$X.XX–$Y.YY (raw), $A–$B (foil)' if foil data exists. Use the actual prices found above.",
  "fullAnalysis": "Full markdown analysis with these sections:\n\n### 1. Price Summary\nCurrent prices from eBay, TCGPlayer, and PriceCharting — cite the specific dollar amounts found above.\n\n### 2. Price Trend\nIs this card's value rising, falling, or stable? What's driving it?\n\n### 3. Value Drivers\n- Rarity & scarcity (${card.rarity}, ${card.setName})\n- Meta relevance (competitive decks, archetypes)\n- Collectibility (character popularity, art appeal)\n- Set context (is ${card.setName} still in print?)\n\n### 4. Competitive Viability\nHow does this card perform in the current meta? Staple or niche?\n\n### 5. Investment Outlook\nShort-term and long-term outlook.\n\n### 6. Comparable Cards\nTable: | Card | Set | Rarity | Price | Notes |\n\nEnd with a one-sentence verdict."
}

DO NOT include prices for promo/challenge/enchanted variants unless this card IS that variant. DO NOT confuse the regular printing with the Challenge promo 6/C2 version.`;

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
        {
          role: "system",
          content: "You are an expert Lorcana TCG market analyst. You provide detailed, specific, and well-reasoned market analysis. You ALWAYS analyze the SPECIFIC card variant identified by card number and set — never confuse regular prints with promo/challenge/enchanted variants. You cite exact prices from provided data. You respond exclusively in valid JSON — no markdown, no commentary outside the JSON object.",
        },
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
    return JSON.stringify({
      summary: "Analysis completed — tap to view details",
      lastSold: "See full analysis",
      currentAverage: "See full analysis",
      fullAnalysis: raw,
    });
  }

  return JSON.stringify({
    summary: parsed.summary || "Analysis completed",
    lastSold: parsed.lastSold || "No data available",
    currentAverage: parsed.currentAverage || "No data available",
    fullAnalysis: parsed.fullAnalysis || raw,
  });
}
