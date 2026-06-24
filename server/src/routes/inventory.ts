import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

const prisma = new PrismaClient();
export const inventoryRouter = Router();

inventoryRouter.use(authenticateToken);

inventoryRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { search, color, set, rarity, type, character } = req.query;

    const where: any = { userId };
    const cardWhere: any = {};

    if (search && typeof search === "string") {
      cardWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { subtitle: { contains: search, mode: "insensitive" } },
      ];
    }
    if (color && typeof color === "string") cardWhere.color = color;
    if (set && typeof set === "string") cardWhere.setName = set;
    if (rarity && typeof rarity === "string") cardWhere.rarity = rarity;
    if (type && typeof type === "string") cardWhere.types = { has: type };
    if (character && typeof character === "string") {
      cardWhere.character = { contains: character, mode: "insensitive" };
    }

    if (Object.keys(cardWhere).length > 0) {
      where.card = cardWhere;
    }

    const entries = await prisma.inventoryEntry.findMany({
      where,
      include: { card: true },
      orderBy: { card: { name: "asc" } },
    });

    res.json(entries);
  } catch (error) {
    console.error("Inventory list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const entries = await prisma.inventoryEntry.findMany({
      where: { userId },
      include: { card: { select: { setName: true } } },
    });

    const totalUnique = entries.length;
    const totalCards = entries.reduce(
      (sum, e) => sum + e.quantity + e.foilQuantity,
      0
    );

    const bySet: Record<string, number> = {};
    for (const entry of entries) {
      const setName = entry.card.setName;
      bySet[setName] = (bySet[setName] || 0) + 1;
    }

    const totalBySet = await prisma.card.groupBy({
      by: ["setName"],
      _count: true,
    });

    const setBreakdown = totalBySet.map((s) => ({
      setName: s.setName,
      owned: bySet[s.setName] || 0,
      total: s._count,
    }));

    res.json({ totalUnique, totalCards, setBreakdown });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { cardId, quantity = 1, foilQuantity = 0 } = req.body;

    if (!cardId) {
      res.status(400).json({ error: "cardId is required" });
      return;
    }

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const entry = await prisma.inventoryEntry.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, quantity, foilQuantity },
      update: {
        quantity: { increment: quantity },
        foilQuantity: { increment: foilQuantity },
      },
      include: { card: true },
    });

    res.status(201).json(entry);
  } catch (error) {
    console.error("Inventory add error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const { quantity, foilQuantity } = req.body;

    const existing = await prisma.inventoryEntry.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Inventory entry not found" });
      return;
    }

    const entry = await prisma.inventoryEntry.update({
      where: { id },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(foilQuantity !== undefined && { foilQuantity }),
      },
      include: { card: true },
    });

    res.json(entry);
  } catch (error) {
    console.error("Inventory update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const existing = await prisma.inventoryEntry.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Inventory entry not found" });
      return;
    }

    await prisma.inventoryEntry.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Inventory delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
