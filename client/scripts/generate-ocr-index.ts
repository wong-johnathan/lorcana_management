// client/scripts/generate-ocr-index.ts
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

interface LorcanaCard {
  id: number;
  name: string;
  version?: string;
  color?: string;
  cost?: number;
  setCode?: string;
  rarity?: string;
  type?: string;
  number?: number;
  fullIdentifier?: string;
  images?: { full?: string };
}

const ALL_CARDS = join(__dirname, "../../server/data/allCards.json");
const OUTPUT = join(__dirname, "../src/modules/beta/ocr/data/ocr-index.json");

console.log("Reading allCards.json...");
const raw = JSON.parse(readFileSync(ALL_CARDS, "utf-8"));

// Build set name map from sets key
const SET_MAP: Record<string, string> = {};
if (raw.sets) {
  for (const [code, set] of Object.entries(raw.sets as Record<string, { name: string }>)) {
    SET_MAP[code] = set.name;
  }
}

const slim: Record<string, SlimCard> = {};
const cards: LorcanaCard[] = raw.cards || [];

for (const card of cards) {
  const setCode = card.setCode || "";
  const cardNumber = card.fullIdentifier || String(card.number || "");

  const entry: SlimCard = {
    id: String(card.id),
    name: card.name || "",
    subtitle: card.version || "",
    color: card.color || "",
    inkCost: card.cost || 0,
    setCode,
    setName: SET_MAP[setCode] || `Set ${setCode}`,
    rarity: card.rarity || "",
    cardType: card.type || "",
    cardNumber,
    imageUrl: card.images?.full || "",
  };

  // Index by full cardNumber: "221/204 • EN • 7"
  slim[cardNumber] = entry;

  // Index by short cardNumber: "221/204"
  const shortNumber = cardNumber.split("•")[0]?.trim();
  if (shortNumber && shortNumber !== cardNumber) {
    slim[shortNumber] = entry;
  }

  // Index by numeric only: "1" or "221"
  const numOnly = String(card.number || "");
  if (numOnly && numOnly !== cardNumber && numOnly !== shortNumber) {
    slim[numOnly] = entry;
  }

  // Index by lowercase name for fuzzy search
  const nameKey = `name:${card.name.toLowerCase()}`;
  if (!slim[nameKey]) {
    slim[nameKey] = entry;
  }
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(slim));
console.log(`Generated ocr-index.json with ${Object.keys(slim).length} entries`);
console.log(`Output: ${OUTPUT}`);
