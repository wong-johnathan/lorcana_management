import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { recognizeCard } from "../services/cardRecognition.js";
import { analyzeCardMarket } from "../services/analysis.js";
import type { AuthPayload } from "../middleware/auth.js";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
export const cardsRouter = Router();

const ADMIN_USERNAME = "jw1005";
const BATCH_RARITIES = ["Enchanted", "Special", "Iconic"];

const PRICE_FIELDS = ["lowPrice", "midPrice", "highPrice", "marketPrice"] as const;
type PriceField = (typeof PRICE_FIELDS)[number];

function parseCsvParam(value: unknown): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPriceField(value: unknown): PriceField {
  return typeof value === "string" && (PRICE_FIELDS as readonly string[]).includes(value)
    ? (value as PriceField)
    : "marketPrice";
}

const VARIANT_ALIASES: Record<string, string[]> = {
  Foil: ["Foil", "Cold Foil", "Holofoil"],
};

function variantsFor(requestedVariant: string): string[] {
  return VARIANT_ALIASES[requestedVariant] ?? [requestedVariant];
}

function pricePresenceCondition(requestedVariant: string, priceField: PriceField) {
  return {
    variant: { in: variantsFor(requestedVariant) },
    [priceField]: { not: null },
  };
}

export function priceForVariant(
  prices: { variant: string; lowPrice: number | null; midPrice: number | null; highPrice: number | null; marketPrice: number | null }[],
  requestedVariant: string,
  priceField: PriceField
): { value: number | null; matchedVariant?: string; reason?: "no_price_for_variant" | "null_price" } {
  const acceptableVariants = variantsFor(requestedVariant);
  const price = acceptableVariants
    .map((variant) => prices.find((p) => p.variant.toLowerCase() === variant.toLowerCase()))
    .find((p): p is NonNullable<typeof p> => Boolean(p));
  if (!price) return { value: null, reason: "no_price_for_variant" };
  const value = price[priceField];
  if (value == null) return { value: null, matchedVariant: price.variant, reason: "null_price" };
  return { value, matchedVariant: price.variant };
}

let batchStatus: {
  status: "idle" | "running" | "completed" | "error";
  total: number;
  completed: number;
  failed: number;
  currentCard: string | null;
  startedAt: string | null;
} = { status: "idle", total: 0, completed: 0, failed: 0, currentCard: null, startedAt: null };

function getUserIdFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    return payload.userId;
  } catch {
    return null;
  }
}

function getAuthPayload(req: Request): AuthPayload | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

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
      ownership,
      analyzed,
      sort,
      priceVariant,
      priceStatus,
      page = "1",
      limit = "40",
    } = req.query;

    const where: any = {};
    const andFilters: any[] = [];

    if (search && typeof search === "string") {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { subtitle: { contains: search, mode: "insensitive" } },
      ];
    }
    if (color && typeof color === "string") where.color = { in: color.split(",") };
    if (set && typeof set === "string") where.setName = { in: set.split(",") };
    if (rarity && typeof rarity === "string") where.rarity = { in: rarity.split(",") };
    if (type && typeof type === "string") where.types = { hasSome: type.split(",") };
    if (character && typeof character === "string") {
      where.character = { contains: character, mode: "insensitive" };
    }
    if (cardType && typeof cardType === "string") where.cardType = cardType;

    if (analyzed && typeof analyzed === "string") {
      if (analyzed === "yes") {
        where.analysis = { status: "completed" };
      } else if (analyzed === "no") {
        where.analysis = null;
      }
    }

    const selectedPriceField = toPriceField(req.query.priceField);
    if (
      priceVariant &&
      typeof priceVariant === "string" &&
      priceStatus &&
      typeof priceStatus === "string" &&
      ["priced", "missing"].includes(priceStatus)
    ) {
      const condition = pricePresenceCondition(priceVariant, selectedPriceField);
      andFilters.push(
        priceStatus === "priced"
          ? { prices: { some: condition } }
          : { NOT: { prices: { some: condition } } }
      );
    }

    if (ownership && typeof ownership === "string") {
      const userId = getUserIdFromRequest(req);
      if (userId) {
        const ownedCardIds = (
          await prisma.inventoryEntry.findMany({
            where: { userId },
            select: { cardId: true },
          })
        ).map((e) => e.cardId);

        if (ownership === "owned") {
          where.id = { in: ownedCardIds };
        } else if (ownership === "not_owned") {
          where.id = { notIn: ownedCardIds };
        }
      }
    }

    if (andFilters.length > 0) where.AND = andFilters;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 40));
    const skip = (pageNum - 1) * limitNum;

    const defaultOrderBy = [{ setCode: "asc" as const }, { name: "asc" as const }];
    const sortOrderBy =
      sort === "price_asc"
        ? [{ displayPrice: { sort: "asc" as const, nulls: "last" as const } }, ...defaultOrderBy]
        : sort === "price_desc"
        ? [{ displayPrice: { sort: "desc" as const, nulls: "last" as const } }, ...defaultOrderBy]
        : defaultOrderBy;

    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: sortOrderBy,
        include: { prices: true },
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
    const [colors, sets, rarities, cardTypes, typeValues] = await Promise.all([
      prisma.card.findMany({ select: { color: true }, distinct: ["color"], orderBy: { color: "asc" } }),
      prisma.card.findMany({ select: { setName: true, setCode: true }, distinct: ["setName"] }),
      prisma.card.findMany({ select: { rarity: true }, distinct: ["rarity"], orderBy: { rarity: "asc" } }),
      prisma.card.findMany({ select: { cardType: true }, distinct: ["cardType"], orderBy: { cardType: "asc" } }),
      prisma.card.findMany({ select: { types: true } }),
    ]);

    const allSubtypes = [...new Set(typeValues.flatMap((t) => t.types))].sort();

    res.json({
      colors: colors.map((c) => c.color),
      sets: sets.sort((a, b) => (parseInt(a.setCode, 10) || 0) - (parseInt(b.setCode, 10) || 0)).map((s) => s.setName),
      rarities: rarities.map((r) => r.rarity),
      cardTypes: cardTypes.map((t) => t.cardType),
      types: allSubtypes,
    });
  } catch (error) {
    console.error("Filters error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Batch analysis (admin only) ─────────────────────────────────────────


cardsRouter.get("/master-set/estimate", async (req: Request, res: Response) => {
  try {
    const { setName, setCode } = req.query;
    const selectedRarities = parseCsvParam(req.query.rarities);
    const selectedVariants = parseCsvParam(req.query.variants);
    const priceField = toPriceField(req.query.priceField);

    if ((!setName || typeof setName !== "string") && (!setCode || typeof setCode !== "string")) {
      res.status(400).json({ error: "setName or setCode is required" });
      return;
    }

    const where: any = {};
    if (setName && typeof setName === "string") where.setName = setName;
    if (setCode && typeof setCode === "string") where.setCode = setCode;
    if (selectedRarities.length > 0) where.rarity = { in: selectedRarities };

    const cards = await prisma.card.findMany({
      where,
      include: { prices: true },
      orderBy: [{ rarity: "asc" }, { cardNumber: "asc" }, { name: "asc" }],
    });

    if (cards.length === 0) {
      res.status(404).json({ error: "No cards found for selected filters" });
      return;
    }

    const variants = selectedVariants.length > 0 ? selectedVariants : ["Normal", "Foil"];
    const allRarities = [...new Set(cards.map((card) => card.rarity))].sort();
    const setInfo = cards[0];

    const breakdownByRarity = new Map<string, {
      rarity: string;
      cardCount: number;
      pricedVariantCount: number;
      missingVariantCount: number;
      total: number;
    }>();
    const breakdownByVariant = new Map<string, {
      variant: string;
      pricedCount: number;
      missingCount: number;
      total: number;
    }>();
    const cardIdsByRarity = new Map<string, Set<string>>();
    const missing: {
      cardId: string;
      name: string;
      subtitle: string;
      rarity: string;
      cardNumber: string;
      variant: string;
      reason: "no_tcgplayer_id" | "no_price_for_variant" | "null_price";
    }[] = [];

    let total = 0;
    let pricedVariantCount = 0;
    let missingVariantCount = 0;

    for (const card of cards) {
      if (!breakdownByRarity.has(card.rarity)) {
        breakdownByRarity.set(card.rarity, {
          rarity: card.rarity,
          cardCount: 0,
          pricedVariantCount: 0,
          missingVariantCount: 0,
          total: 0,
        });
      }
      if (!cardIdsByRarity.has(card.rarity)) cardIdsByRarity.set(card.rarity, new Set());
      cardIdsByRarity.get(card.rarity)!.add(card.id);

      for (const variant of variants) {
        if (!breakdownByVariant.has(variant)) {
          breakdownByVariant.set(variant, { variant, pricedCount: 0, missingCount: 0, total: 0 });
        }

        const byRarity = breakdownByRarity.get(card.rarity)!;
        const byVariant = breakdownByVariant.get(variant)!;
        const result = priceForVariant(card.prices, variant, priceField);

        if (
          variant.toLowerCase() === "normal" &&
          variants.some((v) => v.toLowerCase() === "foil") &&
          result.value == null &&
          priceForVariant(card.prices, "Foil", priceField).value != null
        ) {
          continue;
        }

        if (result.value != null) {
          total += result.value;
          pricedVariantCount++;
          byRarity.pricedVariantCount++;
          byRarity.total += result.value;
          byVariant.pricedCount++;
          byVariant.total += result.value;
        } else {
          const reason = card.tcgPlayerId == null ? "no_tcgplayer_id" : result.reason ?? "no_price_for_variant";
          missingVariantCount++;
          byRarity.missingVariantCount++;
          byVariant.missingCount++;
          missing.push({
            cardId: card.id,
            name: card.name,
            subtitle: card.subtitle,
            rarity: card.rarity,
            cardNumber: card.cardNumber,
            variant,
            reason,
          });
        }
      }
    }

    for (const [rarity, cardIds] of cardIdsByRarity) {
      breakdownByRarity.get(rarity)!.cardCount = cardIds.size;
    }

    res.json({
      setName: setInfo.setName,
      setCode: setInfo.setCode,
      selectedRarities: selectedRarities.length > 0 ? selectedRarities : allRarities,
      selectedVariants: variants,
      priceField,
      cardCount: cards.length,
      pricedVariantCount,
      missingVariantCount,
      total: Number(total.toFixed(2)),
      breakdownByRarity: [...breakdownByRarity.values()]
        .sort((a, b) => a.rarity.localeCompare(b.rarity))
        .map((item) => ({ ...item, total: Number(item.total.toFixed(2)) })),
      breakdownByVariant: [...breakdownByVariant.values()]
        .map((item) => ({ ...item, total: Number(item.total.toFixed(2)) })),
      missing,
    });
  } catch (error) {
    console.error("Master set estimate error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.get("/analyze-batch/status", async (_req: Request, res: Response) => {
  res.json(batchStatus);
});

cardsRouter.post("/analyze-batch", async (req: Request, res: Response) => {
  try {
    const auth = getAuthPayload(req);
    if (!auth || auth.username !== ADMIN_USERNAME) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (batchStatus.status === "running") {
      res.status(409).json({ error: "Batch analysis already in progress", ...batchStatus });
      return;
    }

    const cards = await prisma.card.findMany({
      where: {
        rarity: { in: BATCH_RARITIES },
        OR: [
          { analysis: null },
          { analysis: { status: { not: "completed" } } },
        ],
      },
    });

    if (cards.length === 0) {
      res.json({ status: "completed", message: "All cards already analyzed", total: 0 });
      return;
    }

    batchStatus = {
      status: "running",
      total: cards.length,
      completed: 0,
      failed: 0,
      currentCard: null,
      startedAt: new Date().toISOString(),
    };

    res.json({ status: "running", message: `Batch analysis started for ${cards.length} cards`, total: cards.length });

    // Process sequentially in background
    (async () => {
      for (const card of cards) {
        batchStatus.currentCard = `${card.name}${card.subtitle ? ` - ${card.subtitle}` : ""}`;
        try {
          await prisma.cardAnalysis.upsert({
            where: { cardId: card.id },
            create: { cardId: card.id, analysis: "", status: "pending" },
            update: { status: "pending" },
          });

          const analysis = await analyzeCardMarket(card);
          await prisma.cardAnalysis.update({
            where: { cardId: card.id },
            data: { analysis, status: "completed" },
          });
          batchStatus.completed++;
          console.log(`[batch] ✓ ${batchStatus.completed}/${batchStatus.total} ${card.name}`);
        } catch (err: any) {
          batchStatus.failed++;
          console.error(`[batch] ✗ ${card.name}: ${err.message}`);
          await prisma.cardAnalysis.upsert({
            where: { cardId: card.id },
            create: { cardId: card.id, analysis: `Error: ${err.message}`, status: "error" },
            update: { status: "error", analysis: `Error: ${err.message}` },
          }).catch(() => {});
        }
        // Delay between requests to avoid rate limiting
        await new Promise((r) => setTimeout(r, 2000));
      }
      batchStatus.status = batchStatus.failed === batchStatus.total ? "error" : "completed";
      batchStatus.currentCard = null;
      console.log(`[batch] Done: ${batchStatus.completed} completed, ${batchStatus.failed} failed`);
    })();
  } catch (error) {
    console.error("Batch analysis error:", error);
    batchStatus.status = "error";
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.get("/:id/analysis", async (req: Request, res: Response) => {
  try {
    const cardId = req.params.id as string;
    const analysis = await prisma.cardAnalysis.findUnique({ where: { cardId } });
    if (!analysis) {
      res.status(404).json({ error: "No analysis found" });
      return;
    }
    // Parse analysis JSON if possible — structured format has summary/lastSold/currentAverage/fullAnalysis + LCIF scores
    let summary: string | null = null;
    let lastSold: string | null = null;
    let currentAverage: string | null = null;
    let fullAnalysis: string | null = null;
    let investmentScore: number | null = null;
    let investmentTier: string | null = null;
    let pillarScores: any[] | null = null;
    try {
      const parsed = JSON.parse(analysis.analysis);
      summary = parsed.summary || null;
      lastSold = parsed.lastSold || null;
      currentAverage = parsed.currentAverage || null;
      fullAnalysis = parsed.fullAnalysis || null;
      investmentScore = parsed.investmentScore ?? null;
      investmentTier = parsed.investmentTier || null;
      pillarScores = parsed.pillarScores || null;
    } catch {
      fullAnalysis = analysis.analysis;
    }
    res.json({
      summary,
      lastSold,
      currentAverage,
      fullAnalysis,
      investmentScore,
      investmentTier,
      pillarScores,
      status: analysis.status,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
    });
  } catch (error) {
    console.error("Analysis fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.post("/:id/analyze", async (req: Request, res: Response) => {
  try {
    const cardId = req.params.id as string;
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Verify card exists
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    if (batchStatus.status === "running") {
      res.status(409).json({ error: "Batch analysis is currently running. Please wait until it completes." });
      return;
    }

    // Check for in-progress analysis (prevent double-trigger)
    const existing = await prisma.cardAnalysis.findUnique({ where: { cardId } });
    if (existing?.status === "pending") {
      res.status(409).json({ error: "Analysis already in progress" });
      return;
    }

    // Mark as pending
    await prisma.cardAnalysis.upsert({
      where: { cardId },
      create: { cardId, analysis: "", status: "pending" },
      update: { status: "pending" },
    });

    // Run analysis (don't await in the response — respond immediately)
    analyzeCardMarket(card)
      .then(async (analysis) => {
        await prisma.cardAnalysis.update({
          where: { cardId },
          data: { analysis, status: "completed" },
        });
      })
      .catch(async (err) => {
        console.error(`Analysis failed for card ${cardId}:`, err.message);
        await prisma.cardAnalysis.update({
          where: { cardId },
          data: { status: "error", analysis: `Error: ${err.message}` },
        });
      });

    res.json({ status: "pending", message: "Analysis started" });
  } catch (error) {
    console.error("Analysis trigger error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const card = await prisma.card.findUnique({
      where: { id },
      include: { prices: true },
    });
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
