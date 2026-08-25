import { Router, Response } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  fetchAndSaveRemote,
  upsertCards,
  seedFromLocal,
  LorcanaData,
} from "../services/cardSync.js";
import {
  fetchPriceGroups,
  syncGroupPrices,
  TcgcsvGroup,
} from "../services/priceSync.js";

export const syncRouter = Router();

syncRouter.use(authenticateToken);

export interface SyncStatus {
  status: "idle" | "running" | "completed" | "error";
  total: number;
  completed: number;
  failed: number;
  currentItem: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

function idleStatus(): SyncStatus {
  return {
    status: "idle",
    total: 0,
    completed: 0,
    failed: 0,
    currentItem: null,
    startedAt: null,
    completedAt: null,
  };
}

export let cardSyncStatus: SyncStatus = idleStatus();
export let priceSyncStatus: SyncStatus = idleStatus();

export function resetSyncStatuses() {
  cardSyncStatus = idleStatus();
  priceSyncStatus = idleStatus();
}

async function runCardUpsert(data: LorcanaData): Promise<void> {
  cardSyncStatus = {
    status: "running",
    total: data.cards.length,
    completed: 0,
    failed: 0,
    currentItem: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  try {
    const result = await upsertCards(data, (card, index, total) => {
      cardSyncStatus.completed = index + 1;
      cardSyncStatus.total = total;
      cardSyncStatus.currentItem = card.version
        ? `${card.name} - ${card.version}`
        : card.name;
    });
    cardSyncStatus.failed = result.failed;
    cardSyncStatus.status =
      result.seeded === 0 && result.failed > 0 ? "error" : "completed";
    cardSyncStatus.currentItem = null;
    cardSyncStatus.completedAt = new Date().toISOString();
    console.log("Card sync complete", result.seeded, "seeded,", result.failed, "failed");
  } catch (err) {
    cardSyncStatus.status = "error";
    cardSyncStatus.currentItem = null;
    console.error("Card sync failed", err);
  }
}

async function runPriceGroupSync(groups: TcgcsvGroup[]): Promise<void> {
  priceSyncStatus = {
    status: "running",
    total: groups.length,
    completed: 0,
    failed: 0,
    currentItem: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  try {
    const result = await syncGroupPrices(groups, (info) => {
      priceSyncStatus.completed = info.groupIndex;
      priceSyncStatus.total = info.totalGroups;
      priceSyncStatus.currentItem = info.groupName;
    });
    priceSyncStatus.status = "completed";
    priceSyncStatus.currentItem = null;
    priceSyncStatus.completedAt = new Date().toISOString();
    console.log(
      "Price sync complete",
      result.matched,
      "matched,",
      result.unmatched,
      "unmatched across",
      result.groups,
      "groups"
    );
  } catch (err) {
    priceSyncStatus.status = "error";
    priceSyncStatus.currentItem = null;
    console.error("Price sync failed", err);
  }
}

export async function runPriceSync(): Promise<void> {
  if (priceSyncStatus.status === "running") return;
  let groups: TcgcsvGroup[];
  try {
    groups = await fetchPriceGroups();
  } catch (err) {
    console.error("Price sync fetch error", err);
    return;
  }
  await runPriceGroupSync(groups);
}

syncRouter.get("/refresh/status", (_req: AuthRequest, res: Response) => {
  res.json(cardSyncStatus);
});

syncRouter.post("/refresh", async (_req: AuthRequest, res: Response) => {
  if (cardSyncStatus.status === "running") {
    res.status(409).json({ error: "Card sync already in progress", ...cardSyncStatus });
    return;
  }

  let data: LorcanaData;
  try {
    data = await fetchAndSaveRemote();
  } catch (error) {
    console.error("Card sync fetch error", error);
    res.status(500).json({ error: "Failed to fetch card database" });
    return;
  }

  res.json({
    status: "running",
    message: `Card sync started for ${data.cards.length} cards`,
    total: data.cards.length,
  });
  runCardUpsert(data);
});

syncRouter.post("/seed", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await seedFromLocal();
    res.json({
      message: `Seeded ${result.seeded} cards from local data (${result.failed} failed)`,
      ...result,
    });
  } catch (error) {
    console.error("Seed error", error);
    res.status(500).json({ error: "Failed to seed card database" });
  }
});

syncRouter.get("/prices/status", (_req: AuthRequest, res: Response) => {
  res.json(priceSyncStatus);
});

syncRouter.post("/prices", async (_req: AuthRequest, res: Response) => {
  if (priceSyncStatus.status === "running") {
    res.status(409).json({ error: "Price sync already in progress", ...priceSyncStatus });
    return;
  }

  let groups: TcgcsvGroup[];
  try {
    groups = await fetchPriceGroups();
  } catch (error) {
    console.error("Price sync fetch error", error);
    res.status(500).json({ error: "Failed to fetch price groups" });
    return;
  }

  res.json({
    status: "running",
    message: `Price sync started for ${groups.length} groups`,
    total: groups.length,
  });
  runPriceGroupSync(groups);
});
