// services/cardIndex.ts
import type { RecognizeResult } from "./types";

interface SlimCard {
  id: string;
  name: string;
  subtitle: string;
  color: string;
  inkCost: number;
  setCode: string;
  setName: string;
  rarity: string;
  cardType: string;
  cardNumber: string;
  imageUrl: string;
}

type CardIndex = Record<string, SlimCard>;

let indexPromise: Promise<CardIndex> | null = null;
let index: CardIndex | null = null;

const CACHE_NAME = "lorcana-ocr-index-v1";
const INDEX_PATH = new URL("../data/ocr-index.json", import.meta.url).href;

async function loadIndex(): Promise<CardIndex> {
  if (index) return index;
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    const cache = await caches.open(CACHE_NAME);
    let response = await cache.match(INDEX_PATH);

    if (!response) {
      response = await fetch(INDEX_PATH);
      if (response.ok) {
        cache.put(INDEX_PATH, response.clone());
      }
    }

    if (!response?.ok) {
      throw new Error("Failed to load card index");
    }

    index = await response.json();
    return index!;
  })();

  return indexPromise;
}

/** Levenshtein distance for fuzzy name matching */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Look up a card from OCR results.
 * Priority:
 *   1. Exact cardNumber match
 *   2. Short cardNumber match (just "221/204")
 *   3. Fuzzy name match within 3 Levenshtein edits
 */
export function lookupCard(result: RecognizeResult, _setCode: string): SlimCard | null {
  if (!index) return null;

  // 1. Exact cardNumber match
  if (result.cardNumber && index[result.cardNumber]) {
    return index[result.cardNumber];
  }

  // 2. Short cardNumber match
  if (result.cardNumber) {
    const parts = result.cardNumber.split("•");
    const short = parts[0]?.trim();
    if (short && index[short]) {
      return index[short];
    }
  }

  // 3. Fuzzy name match
  if (result.name) {
    const queryLower = result.name.toLowerCase();

    // Try exact name key first
    const nameKey = `name:${queryLower}`;
    if (index[nameKey]) return index[nameKey];

    // Fuzzy: find best name match within 3 edits
    const nameEntries = Object.entries(index).filter(([k]) => k.startsWith("name:"));

    let bestMatch: [string, SlimCard] | null = null;
    let bestDist = Infinity;

    for (const [key, card] of nameEntries) {
      const storedName = key.replace("name:", "");
      const dist = levenshtein(queryLower, storedName);
      if (dist < bestDist && dist <= 3) {
        bestDist = dist;
        bestMatch = [key, card];
      }
    }

    if (bestMatch) return bestMatch[1];
  }

  return null;
}

/** Preload the index (call on page mount) */
export function preloadIndex(): void {
  loadIndex().catch(console.error);
}

/** Extract unique set names from the loaded index, newest-first by setCode */
export async function getAvailableSets(): Promise<{ code: string; name: string }[]> {
  const idx = await loadIndex();
  const setMap = new Map<string, string>();
  for (const card of Object.values(idx)) {
    if (card.setCode && card.setName && !setMap.has(card.setCode)) {
      setMap.set(card.setCode, card.setName);
    }
  }
  // Sort by setCode descending (newest first), numeric sets before quest sets
  return Array.from(setMap.entries())
    .sort(([a], [b]) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;
      return b.localeCompare(a);
    })
    .map(([code, name]) => ({ code, name }));
}
