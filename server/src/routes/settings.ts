import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

const prisma = new PrismaClient();
export const settingsRouter = Router();

settingsRouter.use(authenticateToken);

settingsRouter.get("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, publicEnabled: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      publicEnabled: user.publicEnabled,
      publicUrl: `/collection/${user.id}`,
    });
  } catch (error) {
    console.error("Settings get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

settingsRouter.patch("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { publicEnabled } = req.body;

    if (typeof publicEnabled !== "boolean") {
      res.status(400).json({ error: "publicEnabled (boolean) is required" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { publicEnabled },
      select: { id: true, publicEnabled: true },
    });

    res.json({
      publicEnabled: user.publicEnabled,
      publicUrl: `/collection/${user.id}`,
    });
  } catch (error) {
    console.error("Settings update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
