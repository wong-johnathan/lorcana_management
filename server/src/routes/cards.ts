import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { analyzeCardMarket } from "../services/analysis.js";
import type { AuthPayload } from "../middleware/auth.js";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
export const cardsRouter = Router();

const ADMIN_USERNAME = "jw1005";
const BATCH_RARITIES = ["Enchanted", "Special", "Iconic"];

const PRICE_FIELDS = ["lowPrice", "midPrice", "highPrice", "marketPrice"] as const;
type PriceField = (typeof PRICE_FIELDS)[number];
const HISTORY_PRICE_FIELDS = ["lowPrice", "midPrice", "highPrice", "marketPrice", "directLowPrice"] as const;
type HistoryPriceField = (typeof HISTORY_PRICE_FIELDS)[number];

export function parseCsvParam(value: unknown): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toPriceField(value: unknown): PriceField {
  return typeof value === "string" && (PRICE_FIELDS as readonly string[]).includes(value)
    ? (value as PriceField)
    : "marketPrice";
}

export function toHistoryPriceField(value: unknown): HistoryPriceField {
  return typeof value === "string" && (HISTORY_PRICE_FIELDS as readonly string[]).includes(value)
    ? (value as HistoryPriceField)
    : "marketPrice";
}

const VARIANT_ALIASES: Record<string, string[]> = {
  Foil: ["Foil", "Cold Foil", "Holofoil"],
};

export function variantsFor(requestedVariant: string): string[] {
  return VARIANT_ALIASES[requestedVariant] ?? [requestedVariant];
}

export function pricePresenceCondition(requestedVariant: string, priceField: PriceField) {
  return {
    variant: { in: variantsFor(requestedVariant) },
    [priceField]: { not: null },
  };
}

function numericSetCode(setCode: string): number {
  return Number(setCode.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
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

    const defaultOrderBy = [
      { setNumber: { sort: "asc" as const, nulls: "last" as const } },
      { collectorNumber: { sort: "asc" as const, nulls: "last" as const } },
      { cardNumber: "asc" as const },
      { name: "asc" as const },
    ];
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
      sets: sets.sort((a, b) => numericSetCode(a.setCode) - numericSetCode(b.setCode)).map((s) => s.setName),
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

function numericPrice(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function emptyPriceSummary() {
  return {
    current: null,
    rangeStart: null,
    low: null,
    high: null,
    changeAmount: null,
    changePercent: null,
  };
}

/**
 * Summary for the selected range.
 *
 * `changeAmount`/`changePercent` compare the latest price against the FIRST priced point
 * in the range, so the figure matches the trend the chart draws. Using the previous
 * snapshot instead would show 0.00% whenever the last two days happened to be flat,
 * even while the range moved.
 */
function priceHistorySummary(points: { price: number | null }[]) {
  const values = points.map((point) => point.price).filter((value): value is number => value != null);
  if (values.length === 0) return emptyPriceSummary();
  const current = values.at(-1) ?? null;
  const rangeStart = values.length > 1 ? values[0] : null;
  const changeAmount = current != null && rangeStart != null ? roundMoney(current - rangeStart) : null;
  const changePercent = current != null && rangeStart != null && rangeStart !== 0
    ? roundMoney(((current - rangeStart) / rangeStart) * 100)
    : null;
  return {
    current,
    rangeStart,
    low: Math.min(...values),
    high: Math.max(...values),
    changeAmount,
    changePercent,
  };
}

/** Day span covered by the priced points, or 0 when there is nothing to span. */
export function priceHistoryAvailableDays(points: { sourceUpdatedAt: string; price: number | null }[]): number {
  const priced = points.filter((point) => point.price != null);
  if (priced.length === 0) return 0;
  const first = Date.parse(priced[0].sourceUpdatedAt);
  const last = Date.parse(priced[priced.length - 1].sourceUpdatedAt);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, Math.ceil((last - first) / (24 * 60 * 60 * 1000)));
}

/**
 * Pick the completed run closest to the window target.
 *
 * TCGCSV's build timestamp drifts by seconds day to day, so the run *on* the target
 * day can land a few seconds after the target instant. Comparing with `lte: target`
 * then silently skips it and the window becomes one day too long — and which run gets
 * used flips depending on that day's drift. Nearest-run avoids both. Ties go to the
 * earlier run so the requested window is never shortened.
 *
 * A run further than one snapshot cadence from the target is rejected: history that
 * simply does not reach back that far must report "no comparison run" rather than
 * quietly compare a 14-day span under a "30D" label.
 */
export function pickNearestSnapshotRun<T extends { sourceUpdatedAt: Date }>(
  runs: T[],
  targetDate: Date,
): T | null {
  if (runs.length === 0) return null;
  const target = targetDate.getTime();
  let best = runs[0];
  let bestDistance = Math.abs(best.sourceUpdatedAt.getTime() - target);
  for (const run of runs.slice(1)) {
    const distance = Math.abs(run.sourceUpdatedAt.getTime() - target);
    if (distance < bestDistance) {
      best = run;
      bestDistance = distance;
    }
  }
  return bestDistance <= PRICE_MOVER_RUN_MATCH_DAYS * 24 * 60 * 60 * 1000 ? best : null;
}

/** Snapshots are daily, so a run must land within this many days of the window target. */
const PRICE_MOVER_RUN_MATCH_DAYS = 1;

/**
 * How far back a card's own snapshot may be borrowed when the comparison run lacks it.
 * One cadence only: it rescues a card missing yesterday's sync without letting a card's
 * real comparison span drift noticeably past the window it is labelled with.
 */
const PRICE_MOVER_FALLBACK_DAYS = 1;

const PRICE_MOVER_WINDOWS = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

type PriceMoverWindow = keyof typeof PRICE_MOVER_WINDOWS;
type PriceMoverType = "gainers" | "losers" | "volatile" | "dollars";

export function toPriceMoverWindow(value: unknown): PriceMoverWindow {
  return typeof value === "string" && value in PRICE_MOVER_WINDOWS ? value as PriceMoverWindow : "24h";
}

export function toPriceMoverType(value: unknown): PriceMoverType {
  return typeof value === "string" && ["gainers", "losers", "volatile", "dollars"].includes(value)
    ? value as PriceMoverType
    : "gainers";
}

export function toMoverLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : 50;
  return Math.min(100, Math.max(1, Number.isFinite(parsed) ? parsed : 50));
}

export function toMoverMin(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export interface PriceMoverMinFilters {
  minPrevPrice: number | null;
  minCurrentPrice: number | null;
  minChangePercent: number | null;
}

export function toPriceMoverMinFilters(query: Record<string, unknown>): PriceMoverMinFilters {
  return {
    minPrevPrice: toMoverMin(query.minPrevPrice),
    minCurrentPrice: toMoverMin(query.minCurrentPrice),
    minChangePercent: toMoverMin(query.minChangePercent),
  };
}

export function passesPriceMoverMinFilters(
  item: { currentPrice: number; previousPrice: number; changePercent: number | null },
  filters: PriceMoverMinFilters,
): boolean {
  if (filters.minPrevPrice != null && item.previousPrice < filters.minPrevPrice) return false;
  if (filters.minCurrentPrice != null && item.currentPrice < filters.minCurrentPrice) return false;
  if (filters.minChangePercent != null && Math.abs(item.changePercent ?? 0) < filters.minChangePercent) return false;
  return true;
}

export function priceMoverSort(type: PriceMoverType) {
  return (a: { changeAmount: number; changePercent: number | null }, b: { changeAmount: number; changePercent: number | null }) => {
    if (type === "losers") {
      return (a.changePercent ?? 0) - (b.changePercent ?? 0) || a.changeAmount - b.changeAmount;
    }
    if (type === "volatile") {
      return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0) || Math.abs(b.changeAmount) - Math.abs(a.changeAmount);
    }
    if (type === "dollars") {
      return Math.abs(b.changeAmount) - Math.abs(a.changeAmount) || Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
    }
    return (b.changePercent ?? 0) - (a.changePercent ?? 0) || b.changeAmount - a.changeAmount;
  };
}

cardsRouter.get("/price-movers", async (req: Request, res: Response) => {
  try {
    const window = toPriceMoverWindow(req.query.window);
    const type = toPriceMoverType(req.query.type);
    const field = toHistoryPriceField(req.query.field);
    const limit = toMoverLimit(req.query.limit);
    const requestedVariant = typeof req.query.variant === "string" && req.query.variant.trim()
      ? req.query.variant.trim()
      : "Normal";
    const allVariants = requestedVariant.toLowerCase() === "all";
    const requestedRarity = typeof req.query.rarity === "string" && req.query.rarity.trim()
      ? req.query.rarity.trim()
      : "all";
    const rarityFilter = requestedRarity.toLowerCase() === "all" ? null : requestedRarity;
    const filters = toPriceMoverMinFilters(req.query as Record<string, unknown>);

    const latestRun = await prisma.tcgcsvPriceSnapshotRun.findFirst({
      where: { categoryId: 71, status: "COMPLETED" },
      orderBy: { sourceUpdatedAt: "desc" },
    });

    if (!latestRun) {
      res.json({
        window,
        type,
        variant: requestedVariant,
        rarity: requestedRarity,
        field,
        currency: "USD",
        currentSourceUpdatedAt: null,
        previousSourceUpdatedAt: null,
        filters,
        comparedCount: 0,
        unchangedCount: 0,
        movedCount: 0,
        gainersCount: 0,
        losersCount: 0,
        items: [],
        emptyReason: "NO_COMPLETED_RUNS",
      });
      return;
    }

    const targetDate = new Date(latestRun.sourceUpdatedAt.getTime() - PRICE_MOVER_WINDOWS[window] * 24 * 60 * 60 * 1000);
    // Runs before the latest one, newest first. The runs table holds one row per daily
    // source build, so this stays small even after years of history.
    const earlierRuns = await prisma.tcgcsvPriceSnapshotRun.findMany({
      where: {
        categoryId: 71,
        status: "COMPLETED",
        sourceUpdatedAt: { lt: latestRun.sourceUpdatedAt },
      },
      orderBy: { sourceUpdatedAt: "desc" },
      take: 400,
    });
    const previousRun = window === "24h" ? earlierRuns[0] ?? null : pickNearestSnapshotRun(earlierRuns, targetDate);

    if (!previousRun) {
      const earliestRun = await prisma.tcgcsvPriceSnapshotRun.findFirst({
        where: { categoryId: 71, status: "COMPLETED" },
        orderBy: { sourceUpdatedAt: "asc" },
      });
      res.json({
        window,
        type,
        variant: requestedVariant,
        rarity: requestedRarity,
        field,
        currency: "USD",
        currentSourceUpdatedAt: latestRun.sourceUpdatedAt.toISOString(),
        previousSourceUpdatedAt: null,
        earliestSourceUpdatedAt: earliestRun?.sourceUpdatedAt.toISOString() ?? null,
        filters,
        comparedCount: 0,
        unchangedCount: 0,
        movedCount: 0,
        gainersCount: 0,
        losersCount: 0,
        items: [],
        emptyReason: "NO_COMPARISON_RUN",
      });
      return;
    }

    const snapshotWhere = (runId: number) => ({
      runId,
      ...(allVariants ? {} : { variant: requestedVariant }),
    });

    const [currentRows, previousRows] = await Promise.all([
      prisma.tcgcsvPriceSnapshot.findMany({ where: snapshotWhere(latestRun.id) }),
      prisma.tcgcsvPriceSnapshot.findMany({ where: snapshotWhere(previousRun.id) }),
    ]);

    const previousByProductVariant = new Map(
      previousRows.map((row) => [`${row.productId}:${row.variant}`, row])
    );

    // Upstream drops a product for a day or two now and then. Rather than silently
    // excluding that card from every window, borrow its own nearest snapshot at or
    // before the target, as long as it sits within the grace band. Only multi-day
    // windows do this: for "24h" an older snapshot would misstate the window.
    const fallbackByProductVariant = new Map<string, { row: (typeof currentRows)[number]; runSourceUpdatedAt: Date }>();
    if (window !== "24h") {
      const missingRows = currentRows.filter((row) => !previousByProductVariant.has(`${row.productId}:${row.variant}`));
      const graceFloor = new Date(targetDate.getTime() - PRICE_MOVER_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
      const eligibleRunIds = earlierRuns
        .filter((run) => run.sourceUpdatedAt <= targetDate && run.sourceUpdatedAt >= graceFloor)
        .map((run) => run.id);
      if (missingRows.length > 0 && eligibleRunIds.length > 0) {
        const borrowedRows = await prisma.tcgcsvPriceSnapshot.findMany({
          where: {
            productId: { in: [...new Set(missingRows.map((row) => row.productId))] },
            ...(allVariants ? {} : { variant: requestedVariant }),
            runId: { in: eligibleRunIds },
          },
          include: { run: { select: { sourceUpdatedAt: true } } },
          orderBy: { run: { sourceUpdatedAt: "asc" } },
        });
        for (const row of borrowedRows) {
          const key = `${row.productId}:${row.variant}`;
          const held = fallbackByProductVariant.get(key);
          if (!held || row.run.sourceUpdatedAt > held.runSourceUpdatedAt) {
            fallbackByProductVariant.set(key, { row, runSourceUpdatedAt: row.run.sourceUpdatedAt });
          }
        }
      }
    }

    const productIds = [...new Set(currentRows.map((row) => row.productId))];
    const cards = await prisma.card.findMany({
      where: {
        tcgPlayerId: { in: productIds },
        ...(rarityFilter ? { rarity: rarityFilter } : {}),
      },
      include: { prices: true },
    });
    const cardsByTcgPlayerId = new Map(cards.map((card) => [card.tcgPlayerId, card]));

    // Everything with a usable earlier price, including cards that did not move:
    // the counts below describe the whole comparable universe, while `items` stays
    // limited to cards that actually moved in the requested direction.
    const candidates = currentRows.flatMap((currentRow) => {
      const key = `${currentRow.productId}:${currentRow.variant}`;
      const previousRow = previousByProductVariant.get(key) ?? fallbackByProductVariant.get(key)?.row;
      if (!previousRow) return [];
      const card = cardsByTcgPlayerId.get(currentRow.productId);
      if (!card) return [];
      const currentPrice = numericPrice((currentRow as any)[field]);
      const previousPrice = numericPrice((previousRow as any)[field]);
      if (currentPrice == null || previousPrice == null) return [];
      const changeAmount = roundMoney(currentPrice - previousPrice);
      if (changeAmount == null) return [];
      const changePercent = previousPrice !== 0 ? roundMoney((changeAmount / previousPrice) * 100) : null;
      const item = {
        card,
        variant: currentRow.variant,
        currentPrice,
        previousPrice,
        changeAmount,
        changePercent,
      };
      if (!passesPriceMoverMinFilters(item, filters)) return [];
      return [item];
    });

    const comparedCount = candidates.length;
    const gainersCount = candidates.filter((item) => item.changeAmount > 0).length;
    const losersCount = candidates.filter((item) => item.changeAmount < 0).length;
    const items = candidates
      .filter((item) => item.changeAmount !== 0)
      .filter((item) => (type === "gainers" ? item.changeAmount > 0 : type === "losers" ? item.changeAmount < 0 : true))
      .sort(priceMoverSort(type))
      .slice(0, limit);

    res.json({
      window,
      type,
      variant: requestedVariant,
      rarity: requestedRarity,
      field,
      currency: "USD",
      currentSourceUpdatedAt: latestRun.sourceUpdatedAt.toISOString(),
      previousSourceUpdatedAt: previousRun.sourceUpdatedAt.toISOString(),
      filters,
      comparedCount,
      unchangedCount: comparedCount - gainersCount - losersCount,
      movedCount: gainersCount + losersCount,
      gainersCount,
      losersCount,
      items,
      ...(items.length === 0 ? { emptyReason: "NO_MOVERS" } : {}),
    });
  } catch (error) {
    console.error("Price movers error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

cardsRouter.get("/:id/price-history", async (req: Request, res: Response) => {
  try {
    const cardId = req.params.id as string;
    const variant = typeof req.query.variant === "string" && req.query.variant.trim()
      ? req.query.variant.trim()
      : "Normal";
    const field = toHistoryPriceField(req.query.field);
    const daysParam = typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : 90;
    const days = Math.min(730, Math.max(1, Number.isFinite(daysParam) ? daysParam : 90));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true, tcgPlayerId: true },
    });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    if (card.tcgPlayerId == null) {
      res.json({
        cardId,
        tcgPlayerId: null,
        variant,
        field,
        currency: "USD",
        rangeDays: days,
        points: [],
        summary: emptyPriceSummary(),
        earliestSourceUpdatedAt: null,
        latestSourceUpdatedAt: null,
        availableDays: 0,
        emptyReason: "NO_TCGPLAYER_ID",
      });
      return;
    }

    // Fetch the card's whole history for this variant so we can report how much
    // history actually exists, then narrow to the requested window in memory.
    const rows = await prisma.tcgcsvPriceSnapshot.findMany({
      where: {
        productId: card.tcgPlayerId,
        variant,
      },
      include: { run: { select: { sourceUpdatedAt: true } } },
      orderBy: { run: { sourceUpdatedAt: "asc" } },
    });

    const allPoints = rows.map((row) => {
      const lowPrice = numericPrice(row.lowPrice);
      const midPrice = numericPrice(row.midPrice);
      const highPrice = numericPrice(row.highPrice);
      const marketPrice = numericPrice(row.marketPrice);
      const directLowPrice = numericPrice(row.directLowPrice);
      const values = { lowPrice, midPrice, highPrice, marketPrice, directLowPrice };
      return {
        sourceUpdatedAt: row.run.sourceUpdatedAt.toISOString(),
        price: values[field],
        ...values,
      };
    });

    const pricedPoints = allPoints.filter((point) => point.price != null);
    const earliestSourceUpdatedAt = pricedPoints[0]?.sourceUpdatedAt ?? null;
    const latestSourceUpdatedAt = pricedPoints[pricedPoints.length - 1]?.sourceUpdatedAt ?? null;
    const availableDays = priceHistoryAvailableDays(allPoints);
    const sinceMs = since.getTime();
    const points = allPoints.filter((point) => Date.parse(point.sourceUpdatedAt) >= sinceMs);

    res.json({
      cardId,
      tcgPlayerId: card.tcgPlayerId,
      variant,
      field,
      currency: "USD",
      rangeDays: days,
      points,
      summary: priceHistorySummary(points),
      earliestSourceUpdatedAt,
      latestSourceUpdatedAt,
      availableDays,
      ...(points.length === 0 ? { emptyReason: "NO_HISTORY" } : {}),
    });
  } catch (error) {
    console.error("Price history error:", error);
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
