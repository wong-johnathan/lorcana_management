
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

export interface PillarScore {
  name: string;
  score: number;
  maxScore: number;
  details: string;
}

export interface AnalysisResult {
  summary: string;
  lastSold: string;
  currentAverage: string;
  fullAnalysis: string;
  investmentScore: number;
  investmentTier: string;
  pillarScores: PillarScore[];
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
  const prompt = `You are a Lorcana TCG market analyst and investment advisor. Analyze the market value of this EXACT card variant using the provided metadata and per-source price data. Additionally, score the card using the Lorcana Card Investment Framework (LCIF) described below.

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

## Lorcana Card Investment Framework (LCIF) — Scoring System

Score this card out of 100 points using the following pillars and sub-factors. Each sub-factor is scored 1–5, then multiplied by its coefficient.

### Pillar 1: Origin & History (30 pts max)
- **Set Prestige & Era** (Score x 2.4, max 12): 5 = First Edition / promo-exclusive / launch set; 4 = early or limited-run set; 3 = standard main set; 2 = supplemental product; 1 = widely available reprint set.
- **Artist Significance** (Score x 2, max 10): 5 = renowned illustrator with collector following; 4 = well-known TCG artist; 3 = recognized artist; 2 = lesser-known; 1 = unknown.
- **Age / Vintage Factor** (Score x 1.6, max 8): 5 = from the first Lorcana sets (2023); 4 = early era; 3 = mid-lifecycle; 2 = recent; 1 = brand new / just released.

### Pillar 2: Desirability (30 pts max)
- **Character Tier** (Score x 3, max 15): 5 = iconic Disney characters (Mickey, Elsa, Stitch, Maleficent); 4 = major franchise characters (Simba, Ariel, Aladdin); 3 = well-known supporting cast; 2 = minor characters; 1 = obscure characters.
- **Artwork & Aesthetics** (Score x 2, max 10): 5 = stunning full-art / enchanted / special art; 4 = excellent illustration; 3 = good art; 2 = average; 1 = plain or bland.
- **Community Sentiment** (Score x 1, max 5): 5 = "grail" status / highly discussed; 4 = popular; 3 = moderate interest; 2 = limited discussion; 1 = no buzz.

### Pillar 3: Scarcity (30 pts max)
- **Conditional Rarity** (Score x 4, max 20): 5 = ultra-low population in graded mint; 4 = scarce in top grade; 3 = moderate availability; 2 = widely available graded; 1 = saturated market.
- **Print Rarity** (Score x 2, max 10): 5 = Enchanted / promo-exclusive; 4 = Legendary / Super Rare; 3 = Rare; 2 = Uncommon; 1 = Common.

### Pillar 4: Market & Risk (10 pts max)
- **Price History & Velocity** (Score x 0.6, max 3): 5 = steady uptrend with strong volume; 3 = stable; 1 = volatile / declining.
- **Future Catalysts** (Score x 0.4, max 2): 5 = upcoming Disney media tie-in or anniversary; 3 = possible catalyst; 1 = no foreseeable catalysts.
- **Long-Term Relevance** (Score x 0.6, max 3): 5 = guaranteed relevance (iconic Disney IP); 3 = moderate staying power; 1 = fad-based.
- **Risk (inverse)** (Score x 0.4, max 2): 5 = no reprints, hard to counterfeit; 3 = moderate risk; 1 = high reprint/counterfeit risk.

### Investment Tiers (based on total score):
- **S-Grade (90–100):** Blue-chip collectible. Top-tier investment asset.
- **A-Grade (75–89):** Excellent investment with strong fundamentals.
- **B-Grade (60–74):** Good speculative pick with some strong points.
- **C-Grade (Below 60):** Collector-grade. Not recommended for investment, suitable for personal collections.

## CRITICAL INSTRUCTIONS

1. **ANALYZE ONLY THE CARD IDENTIFIED ABOVE.** Ignore prices for promo variants, challenge foil variants, enchanted editions, or any card with a different card number or set. If the search results mix regular and promo prices, use ONLY the prices that match the card number "${shortNumber}" and set "${card.setName}".

2. The prices extracted above come from current web search snippets (eBay sold listings, TCGPlayer market prices, PriceCharting). Use them as your primary data source.

3. **CRITICAL: SEPARATE RAW AND GRADED PRICES.** Always distinguish between:
   - **Raw (ungraded/near mint):** prices for ungraded cards
   - **Graded:** PSA 10, PSA 9, PSA 8, BGS 9.5, TAG 10 etc. — always specify the grade

4. For **lastSold**, report the most recent confirmed sale for BOTH raw and graded (if available). Format: "Raw: $X.XX — [source], [date] | PSA 10: $Y.YY — [source], [date]". If only raw data exists, just show raw. If no data, say so.

5. For **currentAverage**, synthesize the price ranges separately for raw and each graded tier. Format: "Raw: $X–$Y | PSA 10: $A–$B | PSA 9: $C–$D". Drop tiers with no data.

6. **SCORE THE CARD** using the LCIF framework above. Provide individual sub-factor scores and a total.

7. You MUST return a valid JSON object with exactly these fields:

{
  "summary": "2-3 sentence executive summary: state the card's market price with raw AND graded ranges, note the card number and variant, mention trend, and state the LCIF investment tier",
  "lastSold": "Most recent confirmed sales — MUST separate raw and graded. Format: 'Raw: $X.XX — source, date | PSA 10: $Y.YY — source, date'. Skip tiers with no data.",
  "currentAverage": "Current market price ranges — MUST separate by condition. Format: 'Raw: $X–$Y | PSA 9: $A–$B | PSA 10: $C–$D'. Include only tiers with actual data.",
  "investmentScore": 72,
  "investmentTier": "B-Grade",
  "pillarScores": [
    {"name": "Origin & History", "score": 20, "maxScore": 30, "details": "Set Prestige: 3 (x2.4=7.2) | Artist: 3 (x2=6) | Age: 4 (x1.6=6.4)"},
    {"name": "Desirability", "score": 22, "maxScore": 30, "details": "Character: 4 (x3=12) | Artwork: 3 (x2=6) | Sentiment: 4 (x1=4)"},
    {"name": "Scarcity", "score": 20, "maxScore": 30, "details": "Conditional: 3 (x4=12) | Print: 4 (x2=8)"},
    {"name": "Market & Risk", "score": 7, "maxScore": 10, "details": "Price History: 4 (x0.6=2.4) | Catalysts: 3 (x0.4=1.2) | Relevance: 4 (x0.6=2.4) | Risk: 3 (x0.4=1.2)"}
  ],
  "fullAnalysis": "Full markdown analysis with these sections:\n\n### 1. Price Summary — Raw vs Graded\nSeparate raw (ungraded) and graded prices across eBay, TCGPlayer, and PriceCharting. Use a table:\n| Condition | Price Range | Source |\n|-----------|------------|--------|\n| Raw (NM) | $X–$Y | eBay/TCGPlayer |\n| PSA 10 | $A–$B | eBay sold |\n(etc.)\n\n### 2. Price Trend\nRising, falling, or stable? Raw vs graded trends may differ.\n\n### 3. Value Drivers\n- Rarity & scarcity (${card.rarity}, ${card.setName})\n- Meta relevance\n- Collectibility\n- Set context\n\n### 4. Competitive Viability\n### 5. LCIF Investment Scorecard\nShow each pillar with score/max, sub-factor breakdown, and rationale.\n### 6. Investment Outlook\nShort-term and long-term — note that graded cards have different investment profiles than raw.\n### 7. Comparable Cards\nTable: | Card | Set | Rarity | Raw Price | PSA 10 Price | LCIF Score | Notes |\n\nEnd with a one-sentence verdict including the LCIF tier."
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
          content: "You are an expert Lorcana TCG market analyst and investment advisor using the Lorcana Card Investment Framework (LCIF). You provide detailed, specific, and well-reasoned market analysis with quantitative investment scoring. You ALWAYS analyze the SPECIFIC card variant identified by card number and set — never confuse regular prints with promo/challenge/enchanted variants. You cite exact prices from provided data. You respond exclusively in valid JSON — no markdown, no commentary outside the JSON object.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 3500,
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
      investmentScore: null,
      investmentTier: null,
      pillarScores: null,
    });
  }

  return JSON.stringify({
    summary: parsed.summary || "Analysis completed",
    lastSold: parsed.lastSold || "No data available",
    currentAverage: parsed.currentAverage || "No data available",
    fullAnalysis: parsed.fullAnalysis || raw,
    investmentScore: parsed.investmentScore ?? null,
    investmentTier: parsed.investmentTier || null,
    pillarScores: parsed.pillarScores || null,
  });
}
