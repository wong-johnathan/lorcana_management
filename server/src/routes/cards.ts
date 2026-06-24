import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { recognizeCard } from "../services/cardRecognition.js";

const prisma = new PrismaClient();
export const cardsRouter = Router();

cardsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const {
      search,
      color,
      set,
      rarity,
      type,
      character,
      cardType,
      page = "1",
      limit = "40",
    } = req.query;

    const where: any = {};

    if (search && typeof search === "string") {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { subtitle: { contains: search, mode: "insensitive" } },
      ];
    }
    if (color && typeof color === "string") where.color = color;
    if (set && typeof set === "string") where.setName = set;
    if (rarity && typeof rarity === "string") where.rarity = rarity;
    if (type && typeof type === "string") where.types = { has: type };
    if (character && typeof character === "string") {
      where.character = { contains: character, mode: "insensitive" };
    }
    if (cardType && typeof cardType === "string") where.cardType = cardType;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 40));
    const skip = (pageNum - 1) * limitNum;

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ setName: "asc" }, { name: "asc" }],
      }),
      prisma.card.count({ where }),
    ]);

    res.json({
      cards,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Cards error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.post("/recognize", async (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "Image data is required" });
      return;
    }

    const result = await recognizeCard(image);
    res.json(result);
  } catch (error) {
    console.error("Recognition error:", error);
    res.status(500).json({ error: "Recognition failed" });
  }
});

cardsRouter.get("/filters", async (_req: Request, res: Response) => {
  try {
    const [colors, sets, rarities, cardTypes] = await Promise.all([
      prisma.card.findMany({ select: { color: true }, distinct: ["color"], orderBy: { color: "asc" } }),
      prisma.card.findMany({ select: { setName: true }, distinct: ["setName"], orderBy: { setName: "asc" } }),
      prisma.card.findMany({ select: { rarity: true }, distinct: ["rarity"], orderBy: { rarity: "asc" } }),
      prisma.card.findMany({ select: { cardType: true }, distinct: ["cardType"], orderBy: { cardType: "asc" } }),
    ]);

    res.json({
      colors: colors.map((c) => c.color),
      sets: sets.map((s) => s.setName),
      rarities: rarities.map((r) => r.rarity),
      cardTypes: cardTypes.map((t) => t.cardType),
    });
  } catch (error) {
    console.error("Filters error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(card);
  } catch (error) {
    console.error("Card detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
