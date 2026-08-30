import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  DEFAULT_INVENTORY_POLICY,
  calculateExtras,
  referencePriceForVariant,
  resolveKeepCounts,
  type InventoryPolicyLike,
  type RetentionOverrideLike,
} from "../services/extrasForSale.js";
import {
  ACTIVE_RESERVATION_CONFLICT_MESSAGE,
  hasActiveReservationsForUserListings,
} from "../services/marketplaceReservationGuards.js";
import {
  compareCardContainerByIndex,
  compareNullableNumber as compareNullableNumberByIndex,
} from "../utils/cardSort.js";

const prisma = new PrismaClient();
export const inventoryRouter = Router();

export type InventoryPrice = { variant: string; marketPrice: number | null };
export type InventoryVariant = "normal" | "foil" | "holofoil";
export type InventoryCountsInput = {
  quantity?: unknown;
  foilQuantity?: unknown;
  holofoilQuantity?: unknown;
};
export type CardFinishInfo = { foilTypes: string[] };

const FOIL_VARIANTS = ["Foil", "Cold Foil"];
const HOLOFOIL_VARIANTS = ["Holofoil", "Cold Foil", "Foil"];
const HOLOFOIL_FOIL_TYPES = new Set([
  "CalendarWave",
  "FreeForm1",
  "FreeForm2",
  "Glitter",
  "Lava",
  "Lore",
  "Magma",
  "RainbowPillars",
  "Satin",
  "SeaWave",
  "Tempest",
  "VerticalWave",
]);

export function marketPriceForVariant(
  prices: InventoryPrice[],
  variants: string[]
): number | null {
  const price = variants
    .map((variant) => prices.find((p) => p.variant.toLowerCase() === variant.toLowerCase()))
    .find((p): p is InventoryPrice => Boolean(p));
  return price?.marketPrice ?? null;
}

export function availableInventoryVariants(card: CardFinishInfo): Set<InventoryVariant> {
  const foilTypes = card.foilTypes ?? [];
  const variants = new Set<InventoryVariant>();

  if (foilTypes.length === 0 || foilTypes.includes("None")) variants.add("normal");
  if (foilTypes.includes("Silver")) variants.add("foil");
  if (foilTypes.some((type) => HOLOFOIL_FOIL_TYPES.has(type))) variants.add("holofoil");

  return variants;
}

export function parseCount(value: unknown, defaultValue = 0): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("Quantities must be non-negative integers");
  }
  return value;
}

export function validateRequestedCounts(card: CardFinishInfo, counts: InventoryCountsInput): string | null {
  const available = availableInventoryVariants(card);
  const quantity = parseCount(counts.quantity);
  const foilQuantity = parseCount(counts.foilQuantity);
  const holofoilQuantity = parseCount(counts.holofoilQuantity);

  if (quantity > 0 && !available.has("normal")) return "Normal is not available for this card";
  if (foilQuantity > 0 && !available.has("foil")) return "Foil is not available for this card";
  if (holofoilQuantity > 0 && !available.has("holofoil")) return "Holofoil is not available for this card";
  return null;
}

export const compareNullableNumber = compareNullableNumberByIndex;
export const compareInventoryEntryByCardIndex = compareCardContainerByIndex;

function serializePolicy(policy: InventoryPolicyLike) {
  return {
    keepNormalQuantity: policy.keepNormalQuantity,
    keepFoilQuantity: policy.keepFoilQuantity,
    keepHolofoilQuantity: policy.keepHolofoilQuantity,
    autoSuggestExtras: policy.autoSuggestExtras ?? true,
  };
}

async function getOrCreateInventoryPolicy(userId: string) {
  return prisma.userInventoryPolicy.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_INVENTORY_POLICY },
    update: {},
  });
}

function parseKeepQuantity(value: unknown, allowNull = false): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && allowNull) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(allowNull ? "Keep quantities must be non-negative integers or null" : "Keep quantities must be non-negative integers");
  }
  return value;
}

function serializeRetentionOverride(override: RetentionOverrideLike & { cardId?: string }) {
  return {
    cardId: override.cardId,
    keepNormalQuantity: override.keepNormalQuantity ?? null,
    keepFoilQuantity: override.keepFoilQuantity ?? null,
    keepHolofoilQuantity: override.keepHolofoilQuantity ?? null,
  };
}

function emptyCounts() {
  return { quantity: 0, foilQuantity: 0, holofoilQuantity: 0 };
}

function parseInventoryVariant(value: string): InventoryVariant | null {
  if (value === "normal" || value === "foil" || value === "holofoil") return value;
  return null;
}

function getVariantCount(counts: ReturnType<typeof emptyCounts>, variant: InventoryVariant): number {
  if (variant === "normal") return counts.quantity;
  if (variant === "foil") return counts.foilQuantity;
  return counts.holofoilQuantity;
}

function countsFromEntry(entry: { quantity: number; foilQuantity: number; holofoilQuantity: number } | null | undefined) {
  if (!entry) return emptyCounts();
  return {
    quantity: entry.quantity,
    foilQuantity: entry.foilQuantity,
    holofoilQuantity: entry.holofoilQuantity,
  };
}

async function growActiveListingsForNewExtras(
  userId: string,
  cardId: string,
  previousEntry: { quantity: number; foilQuantity: number; holofoilQuantity: number } | null | undefined,
  nextEntry: { quantity: number; foilQuantity: number; holofoilQuantity: number }
) {
  const activeListings = await prisma.extraForSaleListing.findMany({ where: { userId, cardId, status: "active" } }) ?? [];
  if (activeListings.length === 0) return;

  const [policy, override] = await Promise.all([
    getOrCreateInventoryPolicy(userId),
    prisma.cardRetentionOverride.findUnique({ where: { userId_cardId: { userId, cardId } } }),
  ]);
  const keep = resolveKeepCounts(policy, override);
  const previousExtras = calculateExtras(countsFromEntry(previousEntry), keep);
  const nextExtras = calculateExtras(countsFromEntry(nextEntry), keep);

  const updates = activeListings.flatMap((listing) => {
    const variant = parseInventoryVariant(listing.variant);
    if (!variant) return [];
    const delta = getVariantCount(nextExtras, variant) - getVariantCount(previousExtras, variant);
    if (delta <= 0) return [];
    return prisma.extraForSaleListing.update({
      where: { id: listing.id },
      data: { desiredQuantity: { increment: delta } },
    });
  });
  await Promise.all(updates);
}

inventoryRouter.use(authenticateToken);

inventoryRouter.get("/policy", async (req: AuthRequest, res: Response) => {
  try {
    const policy = await getOrCreateInventoryPolicy(req.user!.userId);
    res.json(serializePolicy(policy));
  } catch (error) {
    console.error("Inventory policy get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.patch("/policy", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    let keepNormalQuantity: number | undefined;
    let keepFoilQuantity: number | undefined;
    let keepHolofoilQuantity: number | undefined;

    try {
      keepNormalQuantity = parseKeepQuantity(req.body.keepNormalQuantity) as number | undefined;
      keepFoilQuantity = parseKeepQuantity(req.body.keepFoilQuantity) as number | undefined;
      keepHolofoilQuantity = parseKeepQuantity(req.body.keepHolofoilQuantity) as number | undefined;
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid keep quantity" });
      return;
    }

    if (req.body.autoSuggestExtras !== undefined && typeof req.body.autoSuggestExtras !== "boolean") {
      res.status(400).json({ error: "autoSuggestExtras must be a boolean" });
      return;
    }

    if (await hasActiveReservationsForUserListings(prisma, userId)) {
      res.status(409).json({ error: ACTIVE_RESERVATION_CONFLICT_MESSAGE });
      return;
    }

    const data = {
      ...(keepNormalQuantity !== undefined && { keepNormalQuantity }),
      ...(keepFoilQuantity !== undefined && { keepFoilQuantity }),
      ...(keepHolofoilQuantity !== undefined && { keepHolofoilQuantity }),
      ...(req.body.autoSuggestExtras !== undefined && { autoSuggestExtras: req.body.autoSuggestExtras }),
    };

    const policy = await prisma.userInventoryPolicy.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_INVENTORY_POLICY, ...data },
      update: data,
    });

    res.json(serializePolicy(policy));
  } catch (error) {
    console.error("Inventory policy update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.get("/extras", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const policy = await getOrCreateInventoryPolicy(userId);
    const [overrides, listings, entries] = await Promise.all([
      prisma.cardRetentionOverride.findMany({ where: { userId } }),
      prisma.extraForSaleListing.findMany({ where: { userId, status: "active" } }),
      prisma.inventoryEntry.findMany({
        where: { userId },
        include: { card: { include: { prices: true } } },
      }),
    ]);

    const overrideByCardId = new Map(overrides.map((override) => [override.cardId, override]));
    const listedVariantsByCardId = new Map<string, Set<InventoryVariant>>();
    for (const listing of listings) {
      const variant = parseInventoryVariant(listing.variant);
      if (!variant) continue;
      const variants = listedVariantsByCardId.get(listing.cardId) ?? new Set<InventoryVariant>();
      variants.add(variant);
      listedVariantsByCardId.set(listing.cardId, variants);
    }

    const cards = entries
      .map((entry) => {
        const owned = {
          quantity: entry.quantity,
          foilQuantity: entry.foilQuantity,
          holofoilQuantity: entry.holofoilQuantity,
        };
        const keep = resolveKeepCounts(policy, overrideByCardId.get(entry.cardId));
        const extras = calculateExtras(owned, keep);
        const listedVariants = listedVariantsByCardId.get(entry.cardId) ?? new Set<InventoryVariant>();
        const activeListings = {
          quantity: listedVariants.has("normal") ? extras.quantity : 0,
          foilQuantity: listedVariants.has("foil") ? extras.foilQuantity : 0,
          holofoilQuantity: listedVariants.has("holofoil") ? extras.holofoilQuantity : 0,
        };
        const availableToList = {
          quantity: listedVariants.has("normal") ? 0 : extras.quantity,
          foilQuantity: listedVariants.has("foil") ? 0 : extras.foilQuantity,
          holofoilQuantity: listedVariants.has("holofoil") ? 0 : extras.holofoilQuantity,
        };
        return {
          card: entry.card,
          owned,
          keep,
          extras,
          activeListings,
          availableToList,
          referencePrices: {
            normal: referencePriceForVariant(entry.card.prices, "normal"),
            foil: referencePriceForVariant(entry.card.prices, "foil"),
            holofoil: referencePriceForVariant(entry.card.prices, "holofoil"),
          },
        };
      })
      .filter((item) => (
        item.availableToList.quantity + item.availableToList.foilQuantity + item.availableToList.holofoilQuantity > 0
      ))
      .sort(compareCardContainerByIndex);

    res.json({ policy: serializePolicy(policy), cards });
  } catch (error) {
    console.error("Inventory extras error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.get("/retention", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const overrides = await prisma.cardRetentionOverride.findMany({
      where: { userId },
      include: { card: true },
      orderBy: { card: { name: "asc" } },
    });
    res.json({
      overrides: overrides.map((override) => ({
        cardId: override.cardId,
        card: override.card,
        keepNormalQuantity: override.keepNormalQuantity ?? null,
        keepFoilQuantity: override.keepFoilQuantity ?? null,
        keepHolofoilQuantity: override.keepHolofoilQuantity ?? null,
      })),
    });
  } catch (error) {
    console.error("Retention override list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.get("/retention/:cardId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { cardId } = req.params as { cardId: string };
    const override = await prisma.cardRetentionOverride.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });
    res.json({ override: override ? serializeRetentionOverride(override) : null });
  } catch (error) {
    console.error("Retention override get error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.put("/retention/:cardId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { cardId } = req.params as { cardId: string };
    let keepNormalQuantity: number | null | undefined;
    let keepFoilQuantity: number | null | undefined;
    let keepHolofoilQuantity: number | null | undefined;

    try {
      keepNormalQuantity = parseKeepQuantity(req.body.keepNormalQuantity, true);
      keepFoilQuantity = parseKeepQuantity(req.body.keepFoilQuantity, true);
      keepHolofoilQuantity = parseKeepQuantity(req.body.keepHolofoilQuantity, true);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid keep quantity" });
      return;
    }

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    if (await hasActiveReservationsForUserListings(prisma, userId, cardId)) {
      res.status(409).json({ error: ACTIVE_RESERVATION_CONFLICT_MESSAGE });
      return;
    }

    const data = {
      ...(keepNormalQuantity !== undefined && { keepNormalQuantity }),
      ...(keepFoilQuantity !== undefined && { keepFoilQuantity }),
      ...(keepHolofoilQuantity !== undefined && { keepHolofoilQuantity }),
    };

    const override = await prisma.cardRetentionOverride.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, ...data },
      update: data,
    });
    res.json({ override: serializeRetentionOverride(override) });
  } catch (error) {
    console.error("Retention override update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.delete("/retention/:cardId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { cardId } = req.params as { cardId: string };
    if (await hasActiveReservationsForUserListings(prisma, userId, cardId)) {
      res.status(409).json({ error: ACTIVE_RESERVATION_CONFLICT_MESSAGE });
      return;
    }
    await prisma.cardRetentionOverride.deleteMany({ where: { userId, cardId } });
    res.status(204).send();
  } catch (error) {
    console.error("Retention override delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
    if (color && typeof color === "string") cardWhere.color = { in: color.split(",") };
    if (set && typeof set === "string") cardWhere.setName = { in: set.split(",") };
    if (rarity && typeof rarity === "string") cardWhere.rarity = { in: rarity.split(",") };
    if (type && typeof type === "string") cardWhere.types = { hasSome: type.split(",") };
    if (character && typeof character === "string") {
      cardWhere.character = { contains: character, mode: "insensitive" };
    }

    if (Object.keys(cardWhere).length > 0) {
      where.card = cardWhere;
    }

    const entries = await prisma.inventoryEntry.findMany({
      where,
      include: { card: { include: { prices: true } } },
    });

    entries.sort(compareInventoryEntryByCardIndex);

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
      include: {
        card: {
          select: {
            setName: true,
            prices: { select: { variant: true, marketPrice: true } },
          },
        },
      },
    });

    const totalUnique = entries.length;
    const totalCards = entries.reduce(
      (sum, e) => sum + e.quantity + e.foilQuantity + e.holofoilQuantity,
      0
    );

    const bySet: Record<string, number> = {};
    let totalValue = 0;
    let missingPriceCount = 0;
    for (const entry of entries) {
      const setName = entry.card.setName;
      bySet[setName] = (bySet[setName] || 0) + 1;

      const normalPrice = marketPriceForVariant(entry.card.prices, ["Normal"]);
      const foilPrice = marketPriceForVariant(entry.card.prices, FOIL_VARIANTS);
      const holofoilPrice = marketPriceForVariant(entry.card.prices, HOLOFOIL_VARIANTS);

      if (entry.quantity > 0) {
        if (normalPrice == null) missingPriceCount += entry.quantity;
        else totalValue += entry.quantity * normalPrice;
      }
      if (entry.foilQuantity > 0) {
        if (foilPrice == null) missingPriceCount += entry.foilQuantity;
        else totalValue += entry.foilQuantity * foilPrice;
      }
      if (entry.holofoilQuantity > 0) {
        if (holofoilPrice == null) missingPriceCount += entry.holofoilQuantity;
        else totalValue += entry.holofoilQuantity * holofoilPrice;
      }
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

    res.json({
      totalUnique,
      totalCards,
      totalValue: Number(totalValue.toFixed(2)),
      missingPriceCount,
      setBreakdown,
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.delete("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    if (await hasActiveReservationsForUserListings(prisma, userId)) {
      res.status(409).json({ error: ACTIVE_RESERVATION_CONFLICT_MESSAGE });
      return;
    }
    const result = await prisma.inventoryEntry.deleteMany({ where: { userId } });
    res.json({ deleted: result.count });
  } catch (error) {
    console.error("Inventory wipe error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.get("/export/csv", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const entries = await prisma.inventoryEntry.findMany({
      where: { userId },
      include: { card: true },
      orderBy: { card: { name: "asc" } },
    });

    const lines = ["Set Number,Card Number,Variant,Count"];
    for (const e of entries) {
      const setNum = e.card.setCode || "";
      const cardNum = (e.card.cardNumber || "").split(/[/•]/)[0].trim();
      if (e.quantity > 0) lines.push(`${setNum},${cardNum},normal,${e.quantity}`);
      if (e.foilQuantity > 0) lines.push(`${setNum},${cardNum},foil,${e.foilQuantity}`);
      if (e.holofoilQuantity > 0) lines.push(`${setNum},${cardNum},holofoil,${e.holofoilQuantity}`);
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=lorcana_collection.csv");
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Export CSV error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.get("/export/decklist", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const entries = await prisma.inventoryEntry.findMany({
      where: { userId },
      include: { card: true },
      orderBy: { card: { name: "asc" } },
    });

    const lines = entries.map((e) => {
      const total = e.quantity + e.foilQuantity + e.holofoilQuantity;
      const name = e.card.subtitle
        ? `${e.card.name} - ${e.card.subtitle}`
        : e.card.name;
      return `${total} ${name}`;
    });

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=lorcana_decklist.txt");
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Export decklist error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

inventoryRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const {
      cardId,
      quantity: rawQuantity = 1,
      foilQuantity: rawFoilQuantity = 0,
      holofoilQuantity: rawHolofoilQuantity = 0,
    } = req.body;

    if (!cardId) {
      res.status(400).json({ error: "cardId is required" });
      return;
    }

    let quantity: number;
    let foilQuantity: number;
    let holofoilQuantity: number;
    try {
      quantity = parseCount(rawQuantity, 1);
      foilQuantity = parseCount(rawFoilQuantity);
      holofoilQuantity = parseCount(rawHolofoilQuantity);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid quantity" });
      return;
    }

    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const validationError = validateRequestedCounts(card, { quantity, foilQuantity, holofoilQuantity });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const existingEntry = await prisma.inventoryEntry.findFirst({ where: { userId, cardId } });
    const entry = await prisma.inventoryEntry.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, quantity, foilQuantity, holofoilQuantity },
      update: {
        quantity: { increment: quantity },
        foilQuantity: { increment: foilQuantity },
        holofoilQuantity: { increment: holofoilQuantity },
      },
      include: { card: { include: { prices: true } } },
    });

    await growActiveListingsForNewExtras(userId, cardId, existingEntry, entry);

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
    const { quantity, foilQuantity, holofoilQuantity } = req.body;

    try {
      if (quantity !== undefined) parseCount(quantity);
      if (foilQuantity !== undefined) parseCount(foilQuantity);
      if (holofoilQuantity !== undefined) parseCount(holofoilQuantity);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid quantity" });
      return;
    }

    const existing = await prisma.inventoryEntry.findFirst({
      where: { id, userId },
      include: { card: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Inventory entry not found" });
      return;
    }

    const validationError = validateRequestedCounts(existing.card, {
      quantity: quantity ?? 0,
      foilQuantity: foilQuantity ?? 0,
      holofoilQuantity: holofoilQuantity ?? 0,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (await hasActiveReservationsForUserListings(prisma, userId, existing.cardId)) {
      res.status(409).json({ error: ACTIVE_RESERVATION_CONFLICT_MESSAGE });
      return;
    }

    const entry = await prisma.inventoryEntry.update({
      where: { id },
      data: {
        ...(quantity !== undefined && { quantity }),
        ...(foilQuantity !== undefined && { foilQuantity }),
        ...(holofoilQuantity !== undefined && { holofoilQuantity }),
      },
      include: { card: { include: { prices: true } } },
    });

    await growActiveListingsForNewExtras(userId, existing.cardId, existing, entry);

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

    if (await hasActiveReservationsForUserListings(prisma, userId, existing.cardId)) {
      res.status(409).json({ error: ACTIVE_RESERVATION_CONFLICT_MESSAGE });
      return;
    }

    await prisma.inventoryEntry.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Inventory delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
