import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const DATA_PATH = join(__dirname, "../data/allCards.json");

interface LorcanaAbility {
  fullText?: string;
}

interface LorcanaCard {
  id: number;
  name: string;
  version?: string;
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
  images?: { full?: string };
}

interface LorcanaSet {
  name?: string;
}

async function main() {
  console.log("Reading local card data...");

  const raw = readFileSync(DATA_PATH, "utf-8");
  const data: { cards: LorcanaCard[]; sets: Record<string, LorcanaSet> } =
    JSON.parse(raw);

  const { cards, sets: setMap } = data;
  console.log(
    `Found ${cards.length} cards across ${Object.keys(setMap).length} sets. Seeding...`
  );

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
    if (seeded % 200 === 0) {
      console.log(`  Seeded ${seeded}/${cards.length} cards...`);
    }
  }

  console.log(`Done! Seeded ${seeded} cards.`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
