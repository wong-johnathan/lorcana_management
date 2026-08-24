import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const DATA_PATH = join(__dirname, "../../data/allCards.json");

interface LorcanaAbility {
  fullText?: string;
}

interface LorcanaCard {
  id: number;
  name: string;
  version?: string;
  story?: string;
  subtypes?: string[];
  type?: string;
  color?: string;
  setCode?: string;
  rarity?: string;
  cost?: number;
  strength?: number;
  willpower?: number;
  lore?: number;
  fullText?: string;
  abilities?: LorcanaAbility[];
  number?: number;
  fullIdentifier?: string;
  foilTypes?: string[];
  images?: { full?: string; thumbnail?: string };
  externalLinks?: { tcgPlayerId?: number; cardTraderUrl?: string; cardmarketUrl?: string };
}

interface LorcanaSet {
  name?: string;
}

export interface LorcanaData {
  cards: LorcanaCard[];
  sets: Record<string, LorcanaSet>;
}

export interface UpsertResult {
  seeded: number;
  failed: number;
}

export type UpsertProgressCallback = (
  card: LorcanaCard,
  index: number,
  total: number
) => void;

function parseData(raw: string): LorcanaData {
  return JSON.parse(raw);
}

function parseSetNumber(setCode: string): number | null {
  const match = setCode.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseCollectorNumber(card: LorcanaCard): number | null {
  if (typeof card.number === "number") return card.number;
  const match = card.fullIdentifier?.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

export async function upsertCards(
  data: LorcanaData,
  onProgress?: UpsertProgressCallback
): Promise<UpsertResult> {
  const { cards, sets: setMap } = data;
  let seeded = 0;
  let failed = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.id) {
      onProgress?.(card, i, cards.length);
      continue;
    }

    try {
      const setCode = card.setCode || "";
      const setNumber = parseSetNumber(setCode);
      const collectorNumber = parseCollectorNumber(card);
      const setName = setMap[setCode]?.name || `Set ${setCode}`;
      const abilitiesText =
        card.fullText ||
        card.abilities?.map((a) => a.fullText).join("\n") ||
        "";

      await prisma.card.upsert({
        where: { externalId: card.id },
        create: {
          externalId: card.id,
          tcgPlayerId: card.externalLinks?.tcgPlayerId ?? null,
          cardTraderUrl: card.externalLinks?.cardTraderUrl ?? null,
          cardmarketUrl: card.externalLinks?.cardmarketUrl ?? null,
          name: card.name || "",
          subtitle: card.version || "",
          character: card.name || null,
          types: card.subtypes || [],
          cardType: card.type || "",
          color: card.color || "",
          setCode,
          setNumber,
          setName,
          rarity: card.rarity || "",
          inkCost: card.cost || 0,
          strength: card.strength || 0,
          willpower: card.willpower || 0,
          lore: card.lore || 0,
          abilities: abilitiesText,
          cardNumber: card.fullIdentifier || String(card.number || ""),
          collectorNumber,
          foilTypes: card.foilTypes || [],
          imageUrl: card.images?.full || "",
        },
        update: {
          tcgPlayerId: card.externalLinks?.tcgPlayerId ?? null,
          cardTraderUrl: card.externalLinks?.cardTraderUrl ?? null,
          cardmarketUrl: card.externalLinks?.cardmarketUrl ?? null,
          name: card.name || "",
          subtitle: card.version || "",
          character: card.name || null,
          types: card.subtypes || [],
          cardType: card.type || "",
          color: card.color || "",
          setCode,
          setNumber,
          setName,
          rarity: card.rarity || "",
          inkCost: card.cost || 0,
          strength: card.strength || 0,
          willpower: card.willpower || 0,
          lore: card.lore || 0,
          abilities: abilitiesText,
          cardNumber: card.fullIdentifier || String(card.number || ""),
          collectorNumber,
          foilTypes: card.foilTypes || [],
          imageUrl: card.images?.full || "",
        },
      });
      seeded++;
    } catch (err) {
      failed++;
      console.error("Card upsert failed for externalId", card.id, err);
    }

    onProgress?.(card, i, cards.length);
  }

  return { seeded, failed };
}

export async function seedFromLocal(): Promise<UpsertResult> {
  const raw = readFileSync(DATA_PATH, "utf-8");
  const data = parseData(raw);
  return upsertCards(data);
}

export async function fetchAndSaveRemote(): Promise<LorcanaData> {
  const response = await fetch(
    "https://lorcanajson.org/files/current/en/allCards.json"
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch LorcanaJSON: ${response.status}`);
  }

  const raw = await response.text();
  writeFileSync(DATA_PATH, raw, "utf-8");

  return parseData(raw);
}
