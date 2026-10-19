import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseData,
  toCardData,
  upsertCards,
  type LorcanaCard,
  type LorcanaData,
} from "../src/services/cardSync.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

const DATA_PATH = join(__dirname, "../data/allCards.json");

type SetMap = LorcanaData["sets"];

function makeCard(overrides: Partial<LorcanaCard> = {}): LorcanaCard {
  return {
    id: 100,
    name: "Mickey Mouse",
    version: "Brave Little Tailor",
    subtypes: ["Hero"],
    type: "Character",
    color: "Amber",
    setCode: "SET1",
    rarity: "Legendary",
    cost: 8,
    strength: 5,
    willpower: 5,
    lore: 4,
    fullText: "Evasive",
    ...overrides,
  };
}

const setMap: SetMap = { SET1: { name: "The First Chapter" } };

describe("toCardData inkwell → inkable mapping", () => {
  it("maps inkwell:true to inkable:true", () => {
    expect(toCardData(makeCard({ inkwell: true }), setMap).inkable).toBe(true);
  });

  it("maps inkwell:false to inkable:false", () => {
    expect(toCardData(makeCard({ inkwell: false }), setMap).inkable).toBe(false);
  });

  it("maps an absent inkwell to inkable:false", () => {
    expect(toCardData(makeCard(), setMap).inkable).toBe(false);
  });

  it("preserves the existing field mappings alongside inkable", () => {
    expect(toCardData(makeCard({ inkwell: true }), setMap)).toEqual(
      expect.objectContaining({
        name: "Mickey Mouse",
        subtitle: "Brave Little Tailor",
        character: "Mickey Mouse",
        types: ["Hero"],
        cardType: "Character",
        color: "Amber",
        setCode: "SET1",
        setNumber: 1,
        setName: "The First Chapter",
        rarity: "Legendary",
        inkCost: 8,
        strength: 5,
        willpower: 5,
        lore: 4,
        abilities: "Evasive",
        inkable: true,
      })
    );
  });
});

describe("upsertCards inkable on create and update (AC-FILT-2.1/2.2)", () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it("writes inkable:true on both create and update for inkwell:true", async () => {
    prismaMock.card.upsert.mockResolvedValue({ id: "db_1" });
    const data: LorcanaData = { sets: setMap, cards: [makeCard({ inkwell: true })] };

    await upsertCards(data);

    expect(prismaMock.card.upsert).toHaveBeenCalledWith({
      where: { externalId: 100 },
      create: expect.objectContaining({ externalId: 100, inkable: true }),
      update: expect.objectContaining({ inkable: true }),
    });
  });

  it("writes inkable:false on both create and update for inkwell:false", async () => {
    prismaMock.card.upsert.mockResolvedValue({ id: "db_1" });
    const data: LorcanaData = { sets: setMap, cards: [makeCard({ inkwell: false })] };

    await upsertCards(data);

    expect(prismaMock.card.upsert).toHaveBeenCalledWith({
      where: { externalId: 100 },
      create: expect.objectContaining({ externalId: 100, inkable: false }),
      update: expect.objectContaining({ inkable: false }),
    });
  });

  it("writes inkable:false on both create and update when inkwell is absent", async () => {
    prismaMock.card.upsert.mockResolvedValue({ id: "db_1" });
    const data: LorcanaData = { sets: setMap, cards: [makeCard()] };

    await upsertCards(data);

    expect(prismaMock.card.upsert).toHaveBeenCalledWith({
      where: { externalId: 100 },
      create: expect.objectContaining({ externalId: 100, inkable: false }),
      update: expect.objectContaining({ inkable: false }),
    });
  });
});

describe("seed/sync backfill mapping over the real catalog (AC-FILT-3.1)", () => {
  it("maps the source inkwell split to the same inkable split", () => {
    const data = parseData(readFileSync(DATA_PATH, "utf-8"));
    let inkableTrue = 0;
    let inkableFalse = 0;
    for (const card of data.cards) {
      if (toCardData(card, data.sets).inkable) inkableTrue++;
      else inkableFalse++;
    }
    expect(inkableTrue).toBe(2471);
    expect(inkableFalse).toBe(761);
  });
});
