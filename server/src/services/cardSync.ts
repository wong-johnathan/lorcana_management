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
  images?: { full?: string; thumbnail?: string };
}

interface LorcanaSet {
  name?: string;
}

interface LorcanaData {
  cards: LorcanaCard[];
  sets: Record<string, LorcanaSet>;
}

function parseData(raw: string): LorcanaData {
  return JSON.parse(raw);
}

async function upsertCards(data: LorcanaData): Promise<number> {
  const { cards, sets: setMap } = data;
  let seeded = 0;

  for (const card of cards) {
    if (!card.id) continue;

    const setCode = card.setCode || "";
    const setName = setMap[setCode]?.name || `Set ${setCode}`;
    const abilitiesText =
      card.fullText ||
      card.abilities?.map((a) => a.fullText).join("\n") ||
      "";

    await prisma.card.upsert({
      where: { externalId: card.id },
      create: {
        externalId: card.id,
        name: card.name || "",
        subtitle: card.version || "",
        character: card.name || null,
        types: card.subtypes || [],
        cardType: card.type || "",
        color: card.color || "",
        setCode,
        setName,
        rarity: card.rarity || "",
        inkCost: card.cost || 0,
        strength: card.strength || 0,
        willpower: card.willpower || 0,
        lore: card.lore || 0,
        abilities: abilitiesText,
        cardNumber: card.fullIdentifier || String(card.number || ""),
        imageUrl: card.images?.full || "",
      },
      update: {
        name: card.name || "",
        subtitle: card.version || "",
        character: card.name || null,
        types: card.subtypes || [],
        cardType: card.type || "",
        color: card.color || "",
        setCode,
        setName,
        rarity: card.rarity || "",
        inkCost: card.cost || 0,
        strength: card.strength || 0,
        willpower: card.willpower || 0,
        lore: card.lore || 0,
        abilities: abilitiesText,
        cardNumber: card.fullIdentifier || String(card.number || ""),
        imageUrl: card.images?.full || "",
      },
    });
    seeded++;
  }

  return seeded;
}

export async function seedFromLocal(): Promise<number> {
  const raw = readFileSync(DATA_PATH, "utf-8");
  const data = parseData(raw);
  return upsertCards(data);
}

export async function syncFromRemote(): Promise<number> {
  const response = await fetch(
    "https://lorcanajson.org/files/current/en/allCards.json"
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch LorcanaJSON: ${response.status}`);
  }

  const raw = await response.text();
  writeFileSync(DATA_PATH, raw, "utf-8");

  const data = parseData(raw);
  return upsertCards(data);
}
