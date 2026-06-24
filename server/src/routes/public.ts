import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const publicRouter = Router();

publicRouter.get("/collection/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { search, color, set, rarity, type, character } = req.query;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, publicEnabled: true },
    });

    if (!user || !user.publicEnabled) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }

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

    const where: any = { userId };
    if (Object.keys(cardWhere).length > 0) {
      where.card = cardWhere;
    }

    const entries = await prisma.inventoryEntry.findMany({
      where,
      include: { card: true },
      orderBy: { card: { name: "asc" } },
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

    const cards = entries.map((e) => ({
      card: e.card,
      quantity: e.quantity,
      foilQuantity: e.foilQuantity,
    }));

    res.json({
      user: { id: user.id, username: user.username },
      cards,
      stats: { totalUnique, totalCards, setBreakdown },
    });
  } catch (error) {
    console.error("Public collection error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
