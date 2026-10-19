import { readFileSync } from "fs";
import { join } from "path";
import { parseData, upsertCards } from "../src/services/cardSync.js";

const DATA_PATH = join(__dirname, "../data/allCards.json");

/**
 * Backfill path for the card catalog. Delegates to `cardSync.upsertCards` so
 * the `inkwell` → `inkable` mapping lives in exactly one place (D1); this
 * script's previous duplicated upsert copy is removed.
 */
async function main() {
  console.log("Reading local card data...");

  const raw = readFileSync(DATA_PATH, "utf-8");
  const data = parseData(raw);
  const { cards, sets } = data;
  console.log(
    `Found ${cards.length} cards across ${Object.keys(sets).length} sets. Seeding...`
  );

  const result = await upsertCards(data, (_card, index, total) => {
    const done = index + 1;
    if (done % 200 === 0 || done === total) {
      console.log(`  Processed ${done}/${total} cards...`);
    }
  });

  console.log(`Done! Seeded ${result.seeded} cards.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  });
