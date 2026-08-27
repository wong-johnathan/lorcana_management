import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  DEFAULT_INVENTORY_POLICY,
  calculateExtras,
  isInventoryVariantAvailable,
  publicQuantityForListing,
  referencePriceForVariant,
  resolveKeepCounts,
  type InventoryCounts,
  type InventoryPolicyLike,
  type InventoryVariant,
  type RetentionOverrideLike,
} from "../services/extrasForSale.js";
import { compareCardContainerByIndex } from "../utils/cardSort.js";

const prisma = new PrismaClient();
export const extrasForSaleRouter = Router();

const LISTING_STATUSES = new Set(["active", "paused"]);

function parseVariant(value: unknown): InventoryVariant {
  if (value === "normal" || value === "foil" || value === "holofoil") return value;
  throw new Error("variant must be normal, foil, or holofoil");
}

function parseDesiredQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("desiredQuantity must be a positive integer");
  }
  return value;
}

function getVariantCount(counts: InventoryCounts, variant: InventoryVariant): number {
  if (variant === "normal") return counts.quantity;
  if (variant === "foil") return counts.foilQuantity;
  return counts.holofoilQuantity;
}

async function getOrCreateInventoryPolicy(userId: string) {
  return prisma.userInventoryPolicy.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_INVENTORY_POLICY },
    update: {},
  });
}

function listingResponse(
  listing: any,
  publicQuantity: number,
  referencePrice: number | null
) {
  return {
    id: listing.id,
    cardId: listing.cardId,
    card: listing.card,
    variant: listing.variant,
    desiredQuantity: listing.desiredQuantity,
    publicQuantity,
    referencePrice,
    note: listing.note ?? null,
    status: listing.status,
  };
}

function currentExtraForVariant(
  entry: { quantity: number; foilQuantity: number; holofoilQuantity: number } | null,
  policy: InventoryPolicyLike,
  override: RetentionOverrideLike | null | undefined,
  variant: InventoryVariant
): number {
  if (!entry) return 0;
  const owned = {
    quantity: entry.quantity,
    foilQuantity: entry.foilQuantity,
    holofoilQuantity: entry.holofoilQuantity,
  };
  const keep = resolveKeepCounts(policy, override);
  return getVariantCount(calculateExtras(owned, keep), variant);
}

extrasForSaleRouter.use(authenticateToken);

extrasForSaleRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [policy, overrides, entries, listings] = await Promise.all([
      getOrCreateInventoryPolicy(userId),
      prisma.cardRetentionOverride.findMany({ where: { userId } }),
      prisma.inventoryEntry.findMany({ where: { userId } }),
      prisma.extraForSaleListing.findMany({
        where: { userId, status: { in: ["active", "paused"] } },
        include: { card: { include: { prices: true } } },
      }),
    ]);

    const overrideByCardId = new Map(overrides.map((override) => [override.cardId, override]));
    const entryByCardId = new Map(entries.map((entry) => [entry.cardId, entry]));
    const responseListings = listings.map((listing) => {
      const variant = parseVariant(listing.variant);
      const extraQuantity = currentExtraForVariant(entryByCardId.get(listing.cardId) ?? null, policy, overrideByCardId.get(listing.cardId), variant);
      const publicQuantity = listing.status === "active" ? publicQuantityForListing(listing.desiredQuantity, extraQuantity) : 0;
      return listingResponse(
        listing,
        publicQuantity,
        referencePriceForVariant(listing.card.prices, variant)
      );
    }).sort(compareCardContainerByIndex);

    res.json({ listings: responseListings });
  } catch (error) {
    console.error("Extras for sale list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

extrasForSaleRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { cardId, note } = req.body;
    if (!cardId || typeof cardId !== "string") {
      res.status(400).json({ error: "cardId is required" });
      return;
    }

    let variant: InventoryVariant;
    let desiredQuantity: number;
    try {
      variant = parseVariant(req.body.variant);
      desiredQuantity = parseDesiredQuantity(req.body.desiredQuantity);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    const card = await prisma.card.findUnique({ where: { id: cardId }, include: { prices: true } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    if (!isInventoryVariantAvailable(card, variant)) {
      res.status(400).json({ error: "Variant is not available for this card" });
      return;
    }

    const [entry, policy, override, existingListing] = await Promise.all([
      prisma.inventoryEntry.findFirst({ where: { userId, cardId } }),
      getOrCreateInventoryPolicy(userId),
      prisma.cardRetentionOverride.findUnique({ where: { userId_cardId: { userId, cardId } } }),
      prisma.extraForSaleListing.findFirst({ where: { userId, cardId, variant } }),
    ]);
    const extraQuantity = currentExtraForVariant(entry, policy, override, variant);
    const nextDesiredQuantity = existingListing?.status === "active"
      ? existingListing.desiredQuantity + desiredQuantity
      : desiredQuantity;
    if (nextDesiredQuantity > extraQuantity) {
      res.status(400).json({ error: "Quantity exceeds current extra inventory" });
      return;
    }

    const listing = existingListing
      ? await prisma.extraForSaleListing.update({
        where: { id: existingListing.id },
        data: {
          desiredQuantity: nextDesiredQuantity,
          note: typeof note === "string" && note.trim() ? note.trim() : null,
          status: "active",
        },
        include: { card: { include: { prices: true } } },
      })
      : await prisma.extraForSaleListing.create({
        data: {
          userId,
          cardId,
          variant,
          desiredQuantity,
          note: typeof note === "string" && note.trim() ? note.trim() : null,
          status: "active",
        },
        include: { card: { include: { prices: true } } },
      });

    const responseStatus = existingListing ? 200 : 201;
    res.status(responseStatus).json({ listing: listingResponse(listing, publicQuantityForListing(nextDesiredQuantity, extraQuantity), referencePriceForVariant(card.prices, variant)) });
  } catch (error) {
    console.error("Extras for sale create error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

extrasForSaleRouter.post("/list-all", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [policy, overrides, entries, existingListings] = await Promise.all([
      getOrCreateInventoryPolicy(userId),
      prisma.cardRetentionOverride.findMany({ where: { userId } }),
      prisma.inventoryEntry.findMany({ where: { userId } }),
      prisma.extraForSaleListing.findMany({ where: { userId } }),
    ]);

    const overrideByCardId = new Map(overrides.map((override) => [override.cardId, override]));
    const listedKeys = new Set(existingListings.map((listing) => `${listing.cardId}:${listing.variant}`));

    const variants: InventoryVariant[] = ["normal", "foil", "holofoil"];
    let created = 0;
    let skipped = 0;

    for (const entry of entries) {
      const keep = resolveKeepCounts(policy, overrideByCardId.get(entry.cardId));
      const extras = calculateExtras(
        { quantity: entry.quantity, foilQuantity: entry.foilQuantity, holofoilQuantity: entry.holofoilQuantity },
        keep
      );
      for (const variant of variants) {
        const extraQuantity = getVariantCount(extras, variant);
        if (extraQuantity <= 0) continue;
        const key = `${entry.cardId}:${variant}`;
        if (listedKeys.has(key)) {
          skipped += 1;
          continue;
        }
        await prisma.extraForSaleListing.create({
          data: { userId, cardId: entry.cardId, variant, desiredQuantity: extraQuantity, status: "active" },
        });
        listedKeys.add(key);
        created += 1;
      }
    }

    res.json({ created, skipped });
  } catch (error) {
    console.error("Extras for sale list-all error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

extrasForSaleRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const existing = await prisma.extraForSaleListing.findFirst({
      where: { id, userId },
      include: { card: { include: { prices: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    let desiredQuantity: number | undefined;
    if (req.body.desiredQuantity !== undefined) {
      try {
        desiredQuantity = parseDesiredQuantity(req.body.desiredQuantity);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }

    if (req.body.status !== undefined && (typeof req.body.status !== "string" || !LISTING_STATUSES.has(req.body.status))) {
      res.status(400).json({ error: "status must be active or paused" });
      return;
    }

    const variant = parseVariant(existing.variant);
    const [entry, policy, override] = await Promise.all([
      prisma.inventoryEntry.findFirst({ where: { userId, cardId: existing.cardId } }),
      getOrCreateInventoryPolicy(userId),
      prisma.cardRetentionOverride.findUnique({ where: { userId_cardId: { userId, cardId: existing.cardId } } }),
    ]);
    const extraQuantity = currentExtraForVariant(entry, policy, override, variant);
    if (desiredQuantity !== undefined && desiredQuantity > extraQuantity) {
      res.status(400).json({ error: "Quantity exceeds current extra inventory" });
      return;
    }

    const listing = await prisma.extraForSaleListing.update({
      where: { id },
      data: {
        ...(desiredQuantity !== undefined && { desiredQuantity }),
        ...(req.body.note !== undefined && { note: typeof req.body.note === "string" && req.body.note.trim() ? req.body.note.trim() : null }),
        ...(req.body.status !== undefined && { status: req.body.status }),
      },
      include: { card: { include: { prices: true } } },
    });
    const nextDesired = desiredQuantity ?? existing.desiredQuantity;
    const nextStatus = req.body.status ?? existing.status;
    const publicQuantity = nextStatus === "active" ? publicQuantityForListing(nextDesired, extraQuantity) : 0;
    res.json({ listing: listingResponse(listing, publicQuantity, referencePriceForVariant(existing.card.prices, variant)) });
  } catch (error) {
    console.error("Extras for sale update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

extrasForSaleRouter.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const existing = await prisma.extraForSaleListing.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    await prisma.extraForSaleListing.update({ where: { id }, data: { status: "removed" } });
    res.status(204).send();
  } catch (error) {
    console.error("Extras for sale delete error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
