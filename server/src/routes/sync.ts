import { Router, Response } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { syncFromRemote, seedFromLocal } from "../services/cardSync.js";

export const syncRouter = Router();

syncRouter.use(authenticateToken);

syncRouter.post("/refresh", async (_req: AuthRequest, res: Response) => {
  try {
    const count = await syncFromRemote();
    res.json({ message: `Synced ${count} cards from LorcanaJSON`, count });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: "Failed to sync card database" });
  }
});

syncRouter.post("/seed", async (_req: AuthRequest, res: Response) => {
  try {
    const count = await seedFromLocal();
    res.json({ message: `Seeded ${count} cards from local data`, count });
  } catch (error) {
    console.error("Seed error:", error);
    res.status(500).json({ error: "Failed to seed card database" });
  }
});
