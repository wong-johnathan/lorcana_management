import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  fetchAndSaveRemote,
  parseData,
  seedFromLocal,
  toCardData,
  upsertCards,
  type LorcanaCard,
  type LorcanaData,
} from "../src/services/cardSync.js";
import { prismaMock, resetPrismaMock } from "./prismaMock";

// Wrap the fs I/O entry points cardSync.ts uses so the real-catalog test below
// still reads the real DATA_PATH by default (the mocks default to the original
// implementations), while seedFromLocal/fetchAndSaveRemote tests can override
// readFileSync/writeFileSync without touching disk or the network.
const realFs = vi.hoisted(() => ({
  readFileSync: null as unknown as typeof import("fs")["readFileSync"],
  writeFileSync: null as unknown as typeof import("fs")["writeFileSync"],
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  realFs.readFileSync = actual.readFileSync;
  realFs.writeFileSync = actual.writeFileSync;
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

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

describe("seedFromLocal() reads DATA_PATH and upserts the parsed cards", () => {
  const fixture = JSON.stringify({
    cards: [makeCard({ id: 100, inkwell: true })],
    sets: setMap,
  });

  beforeEach(() => {
    resetPrismaMock();
    prismaMock.card.upsert.mockResolvedValue({ id: "db_1" });
    mockedReadFileSync.mockReturnValue(fixture);
  });

  afterEach(() => {
    // Restore the real fs implementation so the real-catalog test above (and
    // any later file read) is unaffected regardless of execution order.
    mockedReadFileSync.mockReset();
    mockedReadFileSync.mockImplementation(realFs.readFileSync);
  });

  it("reads DATA_PATH, parses it, upserts, and returns { seeded, failed }", async () => {
    const result = await seedFromLocal();

    expect(mockedReadFileSync).toHaveBeenCalledWith(DATA_PATH, "utf-8");
    expect(prismaMock.card.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalId: 100 },
        create: expect.objectContaining({ externalId: 100, inkable: true }),
      })
    );
    expect(result).toEqual({ seeded: 1, failed: 0 });
  });

  it("counts a card as failed when its upsert rejects", async () => {
    prismaMock.card.upsert.mockRejectedValue(new Error("db unavailable"));

    const result = await seedFromLocal();

    expect(result).toEqual({ seeded: 0, failed: 1 });
  });
});

describe("fetchAndSaveRemote() fetches and persists the remote catalog", () => {
  const remoteUrl = "https://lorcanajson.org/files/current/en/allCards.json";
  const raw = JSON.stringify({
    cards: [makeCard({ id: 200, inkwell: false })],
    sets: setMap,
  });

  beforeEach(() => {
    mockedWriteFileSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockedWriteFileSync.mockReset();
    mockedWriteFileSync.mockImplementation(realFs.writeFileSync);
    vi.unstubAllGlobals();
  });

  it("writes the response body and returns parseData(raw) on ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => raw,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAndSaveRemote();

    expect(fetchMock).toHaveBeenCalledWith(remoteUrl);
    expect(mockedWriteFileSync).toHaveBeenCalledWith(DATA_PATH, raw, "utf-8");
    expect(result).toEqual(parseData(raw));
  });

  it("throws with the response status on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAndSaveRemote()).rejects.toThrow(
      "Failed to fetch LorcanaJSON: 503"
    );
  });
});
