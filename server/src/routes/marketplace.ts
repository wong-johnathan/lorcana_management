import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  authenticateOptional,
  authenticateToken,
  AuthRequest,
} from "../middleware/auth.js";
import {
  availableCount,
  lockInventoryEntry,
} from "../services/marketplaceAvailability.js";
import {
  adjustQuantity,
  cancelTransaction,
  confirmTransfer,
  markSold,
  MarketplaceError,
} from "../services/marketplaceTransitions.js";
import {
  isValidCondition,
  isValidCurrency,
  isValidRating,
  isValidReportTargetType,
  isValidTransactionStatus,
  isValidVariant,
} from "../services/marketplace.js";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_LISTING_PHOTO_BYTES,
  MAX_LISTING_PHOTO_COUNT,
  deleteListingPhoto,
  uploadListingPhoto,
} from "../services/objectStorage.js";
import { normalizePhotoLabel } from "../utils/photoPositionLabels.js";
import { buildPublicProfile } from "./public.js";
import {
  isUnread,
  unreadMessageCount,
} from "../services/marketplaceUnread.js";

const prisma = new PrismaClient();
export const marketplaceRouter = Router();

/**
 * Thin route helpers: B2 services own the availability invariant and the
 * state transitions; these handlers only validate input, assert the role
 * from the authenticated caller, and map `MarketplaceError` to HTTP.
 */
function sendError(res: Response, error: unknown): void {
  if (error instanceof MarketplaceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error("Marketplace route error:", error);
  res.status(500).json({ error: "Internal server error" });
}

function parsePositiveInt(value: unknown, field: string, min = 1): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new MarketplaceError(400, `${field} must be an integer >= ${min}`);
  }
  return value;
}

function parseNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MarketplaceError(400, `${field} must be a non-negative integer`);
  }
  return value;
}

function parsePage(query: Record<string, unknown>): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(query.limit ?? "20"), 10) || 20)
  );
  return { page, limit, skip: (page - 1) * limit };
}

/** Split a CSV query value into trimmed, non-empty tokens; non-strings → []. */
function parseCsv(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** `costs` = CSV of non-negative integers; non-integer/negative tokens are dropped. */
function parseCosts(value: unknown): number[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
}

/** `inkable` tri-state: "inkable" → true, "non-inkable" → false, else no constraint. */
function parseInkable(value: unknown): boolean | undefined {
  if (value === "inkable") return true;
  if (value === "non-inkable") return false;
  return undefined;
}

/**
 * `cardTypes` predicate with the synthetic "Song" type (D7): a card matches
 * "Song" when it is an Action carrying the "Song" subtype.
 */
function cardTypesPredicate(selected: string[]) {
  const nonSong = selected.filter((type) => type !== "Song");
  if (selected.includes("Song") && nonSong.length > 0) {
    return {
      OR: [
        { cardType: { in: nonSong } },
        { cardType: "Action", types: { hasSome: ["Song"] } },
      ],
    };
  }
  if (selected.includes("Song")) {
    return { cardType: "Action", types: { hasSome: ["Song"] } };
  }
  return { cardType: { in: selected } };
}

function parseListingPhotoDataUrl(
  dataUrl: unknown,
  contentType: unknown
): { buffer: Buffer; contentType: string } | { error: string } {
  if (typeof dataUrl !== "string" || typeof contentType !== "string") {
    return { error: "dataUrl and contentType are required" };
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(contentType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return { error: "Unsupported image type" };
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { error: "Invalid image payload" };
  if (match[1] !== contentType) return { error: "Image content type mismatch" };
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) return { error: "Invalid image payload" };
  if (buffer.length > MAX_LISTING_PHOTO_BYTES) return { error: "Image is too large" };
  return { buffer, contentType };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Public listing shape shared by browse, detail, and seller profile. */
function serializeListing(listing: any) {
  const seller = listing.seller;
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    cardId: listing.cardId,
    variant: listing.variant,
    quantity: listing.quantity,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    condition: listing.condition,
    location: listing.location,
    note: listing.note,
    status: listing.status,
    hiddenAt: listing.hiddenAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    card: listing.card ?? null,
    seller: seller
      ? {
          id: seller.id,
          username: seller.username,
          profile: buildPublicProfile(seller.profile),
        }
      : null,
    photos: (listing.photos ?? []).map((photo: any) => ({
      id: photo.id,
      url: photo.url,
      sortOrder: photo.sortOrder,
      label: photo.label ?? null,
    })),
  };
}

/** Vouches for a subject with the completed-deal badge computed at read time (REQ-21). */
async function referencesWithBadge(subjectId: string): Promise<any[]> {
  const [references, completedTxs] = await Promise.all([
    prisma.userReference.findMany({
      where: { subjectId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, username: true } } },
    }),
    prisma.marketplaceTransaction.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ buyerId: subjectId }, { sellerId: subjectId }],
      },
      select: { buyerId: true, sellerId: true },
    }),
  ]);

  const dealtWith = new Set<string>();
  for (const tx of completedTxs) {
    dealtWith.add(tx.buyerId === subjectId ? tx.sellerId : tx.buyerId);
  }

  return references.map((ref: any) => ({
    id: ref.id,
    authorId: ref.authorId,
    author: ref.author,
    subjectId: ref.subjectId,
    comment: ref.comment,
    createdAt: ref.createdAt,
    updatedAt: ref.updatedAt,
    hasCompletedDeal: dealtWith.has(ref.authorId),
  }));
}

async function pendingQuantityForListing(listingId: string): Promise<number> {
  const pending = await prisma.marketplaceTransaction.findMany({
    where: { listingId, status: "PENDING_CONFIRMATION" },
    select: { quantity: true },
  });
  return pending.reduce((sum, row) => sum + row.quantity, 0);
}

// ---------------------------------------------------------------------------
// Public endpoints (REQ-1). Reads require no auth; browse carries optional
// identity so a logged-in seller can have their own listings excluded (REQ-10).
// ---------------------------------------------------------------------------

marketplaceRouter.get(
  "/listings",
  authenticateOptional,
  async (req: AuthRequest, res: Response) => {
    try {
      const query = (req.query ?? {}) as Record<string, unknown>;
      const where: any = {
        status: "ACTIVE",
        hiddenAt: null,
        quantity: { gt: 0 },
      };

      const sellerId = typeof query.sellerId === "string" && query.sellerId ? query.sellerId : undefined;
      if (sellerId) {
        where.sellerId = sellerId;
      } else if (req.user) {
        // REQ-10: a logged-in seller's own listings are excluded from the feed.
        where.sellerId = { not: req.user.userId };
      }

      if (typeof query.variant === "string" && query.variant) where.variant = query.variant;
      if (typeof query.condition === "string" && query.condition) where.condition = query.condition;
      if (typeof query.currency === "string" && query.currency) where.currency = query.currency;

      const priceMin = typeof query.priceMin === "string" ? parseInt(query.priceMin, 10) : NaN;
      const priceMax = typeof query.priceMax === "string" ? parseInt(query.priceMax, 10) : NaN;
      const priceRange: any = {};
      if (Number.isInteger(priceMin) && priceMin >= 0) priceRange.gte = priceMin;
      if (Number.isInteger(priceMax) && priceMax >= 0) priceRange.lte = priceMax;
      if (Object.keys(priceRange).length > 0) where.priceMinor = priceRange;

      const cardAnd: any[] = [];
      if (typeof query.q === "string" && query.q.trim()) {
        const term = query.q.trim();
        cardAnd.push({
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { setName: { contains: term, mode: "insensitive" } },
          ],
        });
      }

      const costs = parseCosts(query.costs);
      if (costs.length > 0) cardAnd.push({ inkCost: { in: costs } });

      const inkable = parseInkable(query.inkable);
      if (inkable !== undefined) cardAnd.push({ inkable });

      const subtypes = parseCsv(query.subtypes);
      if (subtypes.length > 0) cardAnd.push({ types: { hasSome: subtypes } });

      const cardTypes = parseCsv(query.cardTypes);
      if (cardTypes.length > 0) cardAnd.push(cardTypesPredicate(cardTypes));

      // REQ-POL-4/5: color/set/rarity browse predicates join the same AND array
      // (AND across filters, OR within a filter via `in`). Unknown values match
      // nothing (no error); omitting all three leaves `where` unchanged.
      const colors = parseCsv(query.colors);
      if (colors.length > 0) cardAnd.push({ color: { in: colors } });

      const sets = parseCsv(query.sets);
      if (sets.length > 0) cardAnd.push({ setName: { in: sets } });

      const rarities = parseCsv(query.rarities);
      if (rarities.length > 0) cardAnd.push({ rarity: { in: rarities } });

      // D5: enhanced predicates AND with the existing `q` OR-block (never
      // overwrite it). Built only when at least one card predicate applies so
      // omitting every new param keeps `where` byte-for-byte unchanged.
      if (cardAnd.length > 0) where.card = { AND: cardAnd };

      const { page, limit, skip } = parsePage(query);
      const [listings, total] = await Promise.all([
        prisma.marketplaceListing.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            card: true,
            photos: { orderBy: { sortOrder: "asc" } },
            seller: { select: { id: true, username: true, profile: true } },
          },
        }),
        prisma.marketplaceListing.count({ where }),
      ]);

      res.json({
        listings: listings.map(serializeListing),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// The seller's own listings (REQ-7 §9 \"my listings\"), including CLOSED and
// hidden rows that the public browse feed deliberately excludes (D2). Registered
// BEFORE `/listings/:id` so the literal `/mine` segment wins over the `:id` param.
marketplaceRouter.get(
  "/listings/mine",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const listings = await prisma.marketplaceListing.findMany({
        where: { sellerId: userId },
        orderBy: { createdAt: "desc" },
        include: {
          card: { include: { prices: true } },
          photos: { orderBy: { sortOrder: "asc" } },
          seller: { select: { id: true, username: true, profile: true } },
        },
      });
      res.json({ listings: listings.map(serializeListing) });
    } catch (error) {
      sendError(res, error);
    }
  }
);

marketplaceRouter.get(
  "/listings/:id",
  authenticateOptional,
  async (req: AuthRequest, res: Response) => {
    try {
      const listing = await prisma.marketplaceListing.findUnique({
        where: { id: req.params.id as string },
        include: {
          card: true,
          photos: { orderBy: { sortOrder: "asc" } },
          seller: { select: { id: true, username: true, profile: true } },
        },
      });
      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }
      if (listing.hiddenAt) {
        res.status(410).json({ error: "Listing is no longer available" });
        return;
      }

      const pendingQuantity = await pendingQuantityForListing(listing.id);
      res.json({
        ...serializeListing(listing),
        pendingQuantity,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

marketplaceRouter.get(
  "/sellers/:userId",
  authenticateOptional,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, profile: true },
      });
      if (!user) {
        res.status(404).json({ error: "Seller not found" });
        return;
      }

      const [listings, reviews, references] = await Promise.all([
        prisma.marketplaceListing.findMany({
          where: { sellerId: userId, status: "ACTIVE", hiddenAt: null, quantity: { gt: 0 } },
          include: { card: true, photos: { orderBy: { sortOrder: "asc" } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.marketplaceReview.findMany({
          where: { revieweeId: userId },
          orderBy: { createdAt: "desc" },
          include: { reviewer: { select: { id: true, username: true } } },
        }),
        referencesWithBadge(userId),
      ]);

      res.json({
        user: { id: user.id, username: user.username, profile: buildPublicProfile(user.profile) },
        listings: listings.map(serializeListing),
        reviews,
        references,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// Reviews and references are public seller-profile content (REQ-1, AC-19.4 /
// REQ-21). The design's authorization matrix (§8) says public reads need no
// auth; see the discrepancy note on the task card.
marketplaceRouter.get(
  "/users/:userId/reviews",
  authenticateOptional,
  async (req: AuthRequest, res: Response) => {
    try {
      const reviews = await prisma.marketplaceReview.findMany({
        where: { revieweeId: req.params.userId as string },
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { id: true, username: true } } },
      });
      res.json({ reviews });
    } catch (error) {
      sendError(res, error);
    }
  }
);

marketplaceRouter.get(
  "/users/:userId/references",
  authenticateOptional,
  async (req: AuthRequest, res: Response) => {
    try {
      res.json({ references: await referencesWithBadge(req.params.userId as string) });
    } catch (error) {
      sendError(res, error);
    }
  }
);

// ---------------------------------------------------------------------------
// Everything below requires a valid token (REQ-2).
// ---------------------------------------------------------------------------
marketplaceRouter.use(authenticateToken);

marketplaceRouter.post("/listings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { cardId, variant, condition, location, note } = body;

    if (typeof cardId !== "string" || !cardId) {
      throw new MarketplaceError(400, "cardId is required");
    }
    if (!isValidVariant(variant)) {
      throw new MarketplaceError(400, "Invalid variant");
    }
    const quantity = parsePositiveInt(body.quantity, "quantity");
    const priceMinor = parseNonNegativeInt(body.priceMinor, "priceMinor");
    if (!isValidCurrency(body.currency)) {
      throw new MarketplaceError(400, "Invalid currency");
    }
    if (condition !== undefined && condition !== null && !isValidCondition(condition)) {
      throw new MarketplaceError(400, "Invalid condition");
    }
    if (location !== undefined && typeof location !== "string") {
      throw new MarketplaceError(400, "Invalid location");
    }
    if (note !== undefined && note !== null && typeof note !== "string") {
      throw new MarketplaceError(400, "Invalid note");
    }

    const card = await prisma.card.findUnique({ where: { id: cardId as string } });
    if (!card) {
      throw new MarketplaceError(404, "Card not found");
    }

    const listing = await prisma.$transaction(async (tx) => {
      await lockInventoryEntry(tx, userId, cardId as string);
      const available = await availableCount(tx, userId, cardId as string, variant as string);
      if (quantity > available) {
        throw new MarketplaceError(409, "Quantity exceeds available inventory");
      }
      return tx.marketplaceListing.create({
        data: {
          sellerId: userId,
          cardId: cardId as string,
          variant: variant as string,
          quantity,
          priceMinor,
          currency: body.currency as string,
          condition: (condition ?? null) as string | null,
          location: typeof location === "string" ? location : "",
          note: (note ?? null) as string | null,
          status: "ACTIVE",
        },
        include: { card: true, photos: true },
      });
    });

    res.status(201).json(serializeListing(listing));
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.patch("/listings/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const listing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!listing) throw new MarketplaceError(404, "Listing not found");
    if (listing.sellerId !== userId) {
      throw new MarketplaceError(403, "Only the seller can edit this listing");
    }
    if (listing.hiddenAt) {
      throw new MarketplaceError(410, "Listing is no longer available");
    }

    const data: Record<string, unknown> = {};
    let quantity: number | undefined;

    if ("quantity" in body) {
      quantity = parsePositiveInt(body.quantity, "quantity");
      data.quantity = quantity;
    }
    if ("priceMinor" in body) {
      data.priceMinor = parseNonNegativeInt(body.priceMinor, "priceMinor");
    }
    if ("currency" in body) {
      if (!isValidCurrency(body.currency)) throw new MarketplaceError(400, "Invalid currency");
      data.currency = body.currency;
    }
    if ("condition" in body) {
      if (body.condition !== null && !isValidCondition(body.condition)) {
        throw new MarketplaceError(400, "Invalid condition");
      }
      data.condition = body.condition ?? null;
    }
    if ("location" in body) {
      if (typeof body.location !== "string") throw new MarketplaceError(400, "Invalid location");
      data.location = body.location;
    }
    if ("note" in body) {
      if (body.note !== null && typeof body.note !== "string") {
        throw new MarketplaceError(400, "Invalid note");
      }
      data.note = body.note ?? null;
    }

    // REQ-8: price/currency/quantity are locked while a PENDING tx exists.
    const lockedRequested = "quantity" in body || "priceMinor" in body || "currency" in body;
    if (lockedRequested) {
      if (listing.status !== "ACTIVE") {
        throw new MarketplaceError(409, "Listing is not active");
      }
      const pending = await prisma.marketplaceTransaction.findFirst({
        where: { listingId: id, status: "PENDING_CONFIRMATION" },
      });
      if (pending) {
        throw new MarketplaceError(
          409,
          "Price, currency, and quantity are locked while a transaction is pending"
        );
      }
    }

    if (Object.keys(data).length === 0) {
      res.json(serializeListing(listing));
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (quantity !== undefined) {
        await lockInventoryEntry(tx, userId, listing.cardId);
        const available = await availableCount(
          tx,
          userId,
          listing.cardId,
          listing.variant,
          id
        );
        if (quantity > available) {
          throw new MarketplaceError(409, "Quantity exceeds available inventory");
        }
      }
      return tx.marketplaceListing.update({ where: { id }, data: data as any });
    });

    res.json(serializeListing(updated));
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.delete("/listings/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const listing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!listing) throw new MarketplaceError(404, "Listing not found");
    if (listing.sellerId !== userId) {
      throw new MarketplaceError(403, "Only the seller can delete this listing");
    }

    // D9: hard delete is allowed only when the listing has zero transactions of
    // any status (incl. pending) so the review/reference ledger is preserved.
    const txCount = await prisma.marketplaceTransaction.count({ where: { listingId: id } });
    if (txCount > 0) {
      throw new MarketplaceError(409, "Cannot delete a listing with transaction history");
    }

    await prisma.marketplaceListing.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/listings/:id/photos", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const listing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!listing) throw new MarketplaceError(404, "Listing not found");
    if (listing.sellerId !== userId) {
      throw new MarketplaceError(403, "Only the seller can manage this listing");
    }

    // AC-23.2: validate count/size/MIME BEFORE any storage write.
    const parsed = parseListingPhotoDataUrl(req.body?.dataUrl, req.body?.contentType);
    if ("error" in parsed) {
      throw new MarketplaceError(400, parsed.error);
    }

    const count = await prisma.marketplaceListingPhoto.count({ where: { listingId: id } });
    if (count >= MAX_LISTING_PHOTO_COUNT) {
      throw new MarketplaceError(400, `Maximum of ${MAX_LISTING_PHOTO_COUNT} photos per listing`);
    }

    const uploaded = await uploadListingPhoto({
      listingId: id,
      buffer: parsed.buffer,
      contentType: parsed.contentType,
    });
    const photo = await prisma.marketplaceListingPhoto.create({
      data: {
        listingId: id,
        objectKey: uploaded.objectKey,
        url: uploaded.publicUrl,
        sortOrder: count,
        label: normalizePhotoLabel(req.body?.label),
      },
    });

    res.status(201).json(photo);
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.delete(
  "/listings/:id/photos/:photoId",
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const photo = await prisma.marketplaceListingPhoto.findUnique({
        where: { id: req.params.photoId as string },
        include: { listing: true },
      });
      if (!photo) throw new MarketplaceError(404, "Photo not found");
      if (photo.listing.sellerId !== userId) {
        throw new MarketplaceError(403, "Only the seller can manage this listing");
      }

      await prisma.marketplaceListingPhoto.delete({ where: { id: photo.id } });
      await deleteListingPhoto(photo.objectKey);
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  }
);

// Edit-mode photo relabeling (REQ-POL-15, design §6): owner-only, lenient
// normalize, returns the updated photo's wire shape { id, url, sortOrder, label }.
marketplaceRouter.patch(
  "/listings/:id/photos/:photoId",
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const photo = await prisma.marketplaceListingPhoto.findUnique({
        where: { id: req.params.photoId as string },
        include: { listing: true },
      });
      if (!photo) throw new MarketplaceError(404, "Photo not found");
      if (photo.listing.sellerId !== userId) {
        throw new MarketplaceError(403, "Only the seller can manage this listing");
      }

      const updated = await prisma.marketplaceListingPhoto.update({
        where: { id: photo.id },
        data: { label: normalizePhotoLabel(req.body?.label) },
      });
      res.json({
        id: updated.id,
        url: updated.url,
        sortOrder: updated.sortOrder,
        label: updated.label ?? null,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

marketplaceRouter.post("/listings/:id/enquire", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const listing = await prisma.marketplaceListing.findUnique({ where: { id } });
    if (!listing) throw new MarketplaceError(404, "Listing not found");
    if (listing.hiddenAt) throw new MarketplaceError(410, "Listing is no longer available");
    if (listing.status !== "ACTIVE") throw new MarketplaceError(409, "Listing is not active");

    const requestedQuantity = parsePositiveInt(req.body?.requestedQuantity, "requestedQuantity");
    if (requestedQuantity > listing.quantity) {
      throw new MarketplaceError(400, "Requested quantity exceeds the listing quantity");
    }

    // REQ-11: one thread per (buyer, listing) — @@unique([buyerId, listingId]).
    // Re-enquiring reuses the thread and re-activates an ARCHIVED thread (D3).
    // REQ-NOTIF-3.4: the buyer's own thread is atomically marked read at
    // creation so their own enquiry never counts as unread for them.
    const enquiry = await prisma.$transaction(async (tx) => {
      const e = await tx.marketplaceEnquiry.upsert({
        where: { buyerId_listingId: { buyerId: userId, listingId: id } },
        create: {
          listingId: id,
          buyerId: userId,
          sellerId: listing.sellerId,
          requestedQuantity,
          status: "ACTIVE",
        },
        update: { requestedQuantity, status: "ACTIVE" },
      });
      await tx.enquiryReadState.upsert({
        where: { enquiryId_userId: { enquiryId: e.id, userId } },
        create: { enquiryId: e.id, userId },
        update: { lastReadAt: new Date() },
      });
      return e;
    });

    res.status(201).json({ enquiryId: enquiry.id });
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.get("/enquiries", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const enquiries = await prisma.marketplaceEnquiry.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { updatedAt: "desc" },
      include: {
        listing: { select: { id: true, cardId: true, variant: true, quantity: true, priceMinor: true, currency: true, status: true, card: true } },
        buyer: { select: { id: true, username: true } },
        seller: { select: { id: true, username: true } },
      },
    });

    const enquiryIds = enquiries.map((enquiry) => enquiry.id);
    const readStates = enquiryIds.length
      ? await prisma.enquiryReadState.findMany({
          where: { userId, enquiryId: { in: enquiryIds } },
          select: { enquiryId: true, lastReadAt: true },
        })
      : [];
    const messages = enquiryIds.length
      ? await prisma.enquiryMessage.findMany({
          where: { enquiryId: { in: enquiryIds } },
          select: { enquiryId: true, senderId: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const lastReadAt = new Map<string, Date | null>();
    for (const row of readStates) {
      lastReadAt.set(row.enquiryId, row.lastReadAt);
    }

    const messagesByEnquiry = new Map<string, { senderId: string; createdAt: Date }[]>();
    for (const message of messages) {
      const list = messagesByEnquiry.get(message.enquiryId) ?? [];
      list.push(message);
      messagesByEnquiry.set(message.enquiryId, list);
    }

    const lastMessageAt = new Map<string, Date>();
    for (const message of messages) {
      if (!lastMessageAt.has(message.enquiryId)) {
        lastMessageAt.set(message.enquiryId, message.createdAt);
      }
    }

    const items = enquiries
      .map((enquiry: any) => {
        const enquiryMessages = messagesByEnquiry.get(enquiry.id) ?? [];
        const readAt = lastReadAt.get(enquiry.id) ?? null;
        return {
          id: enquiry.id,
          listingId: enquiry.listingId,
          buyerId: enquiry.buyerId,
          sellerId: enquiry.sellerId,
          requestedQuantity: enquiry.requestedQuantity,
          status: enquiry.status,
          createdAt: enquiry.createdAt,
          updatedAt: enquiry.updatedAt,
          listing: enquiry.listing,
          buyer: enquiry.buyer,
          seller: enquiry.seller,
          lastMessageAt: lastMessageAt.get(enquiry.id) ?? enquiry.updatedAt ?? enquiry.createdAt,
          unread: isUnread(enquiry, userId, enquiryMessages, readAt),
          unreadCount: unreadMessageCount(enquiry, userId, enquiryMessages, readAt),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );

    res.json({ enquiries: items });
  } catch (error) {
    sendError(res, error);
  }
});

// Lightweight unread-thread count for the nav badge (REQ-NOTIF-5). Registered
// BEFORE `/enquiries/:id` so the literal `unread-count` segment wins over the
// `:id` param (mirrors `/listings/mine`-before-`/listings/:id`). Three
// index-backed reads over the caller's own threads, no listing/card joins.
marketplaceRouter.get("/enquiries/unread-count", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const enquiries = await prisma.marketplaceEnquiry.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: { id: true, buyerId: true, sellerId: true, createdAt: true, updatedAt: true },
    });
    const enquiryIds = enquiries.map((enquiry) => enquiry.id);
    const readStates = enquiryIds.length
      ? await prisma.enquiryReadState.findMany({
          where: { userId, enquiryId: { in: enquiryIds } },
          select: { enquiryId: true, lastReadAt: true },
        })
      : [];
    const messages = enquiryIds.length
      ? await prisma.enquiryMessage.findMany({
          where: { enquiryId: { in: enquiryIds }, senderId: { not: userId } },
          select: { enquiryId: true, senderId: true, createdAt: true },
        })
      : [];

    const lastReadAt = new Map<string, Date | null>();
    for (const row of readStates) {
      lastReadAt.set(row.enquiryId, row.lastReadAt);
    }
    const messagesByEnquiry = new Map<string, { senderId: string; createdAt: Date }[]>();
    for (const message of messages) {
      const list = messagesByEnquiry.get(message.enquiryId) ?? [];
      list.push(message);
      messagesByEnquiry.set(message.enquiryId, list);
    }

    let count = 0;
    for (const enquiry of enquiries) {
      const enquiryMessages = messagesByEnquiry.get(enquiry.id) ?? [];
      const readAt = lastReadAt.get(enquiry.id) ?? null;
      if (isUnread(enquiry, userId, enquiryMessages, readAt)) count++;
    }

    res.json({ count });
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.get("/enquiries/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;
    const enquiry = await prisma.marketplaceEnquiry.findUnique({
      where: { id },
      include: {
        listing: { include: { card: true, photos: { orderBy: { sortOrder: "asc" } } } },
        buyer: { select: { id: true, username: true } },
        seller: { select: { id: true, username: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!enquiry) throw new MarketplaceError(404, "Enquiry not found");
    if (enquiry.buyerId !== userId && enquiry.sellerId !== userId) {
      throw new MarketplaceError(403, "You are not a participant in this enquiry");
    }

    // REQ-NOTIF-3.2/3.3: mark the viewer's thread read as a GET side effect,
    // only after the participant authz check (a 403 never touches read state).
    await prisma.enquiryReadState.upsert({
      where: { enquiryId_userId: { enquiryId: id, userId } },
      create: { enquiryId: id, userId },
      update: { lastReadAt: new Date() },
    });

    res.json({
      enquiry: {
        id: enquiry.id,
        listingId: enquiry.listingId,
        buyerId: enquiry.buyerId,
        sellerId: enquiry.sellerId,
        requestedQuantity: enquiry.requestedQuantity,
        status: enquiry.status,
        createdAt: enquiry.createdAt,
        updatedAt: enquiry.updatedAt,
        listing: enquiry.listing,
        buyer: enquiry.buyer,
        seller: enquiry.seller,
      },
      messages: enquiry.messages.map((message: any) => ({
        id: message.id,
        enquiryId: message.enquiryId,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/enquiries/:id/messages", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const enquiry = await prisma.marketplaceEnquiry.findUnique({ where: { id } });
    if (!enquiry) throw new MarketplaceError(404, "Enquiry not found");
    if (enquiry.buyerId !== userId && enquiry.sellerId !== userId) {
      throw new MarketplaceError(403, "You are not a participant in this enquiry");
    }
    if (enquiry.status !== "ACTIVE") {
      throw new MarketplaceError(409, "Enquiry is not active");
    }

    const body = req.body?.body;
    if (typeof body !== "string" || body.length === 0) {
      throw new MarketplaceError(400, "Message body is required");
    }

    // REQ-NOTIF-3.4: the sender's own thread is atomically marked read after
    // creating their message, so their own message never counts as unread.
    const message = await prisma.$transaction(async (tx) => {
      const m = await tx.enquiryMessage.create({
        data: { enquiryId: id, senderId: userId, body },
      });
      await tx.enquiryReadState.upsert({
        where: { enquiryId_userId: { enquiryId: id, userId } },
        create: { enquiryId: id, userId },
        update: { lastReadAt: new Date() },
      });
      return m;
    });
    res.status(201).json(message);
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/enquiries/:id/mark-sold", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const enquiry = await prisma.marketplaceEnquiry.findUnique({ where: { id } });
    if (!enquiry) throw new MarketplaceError(404, "Enquiry not found");
    if (enquiry.sellerId !== userId) {
      throw new MarketplaceError(403, "Only the seller can mark this enquiry sold");
    }

    const quantity = req.body?.quantity ?? enquiry.requestedQuantity;
    parsePositiveInt(quantity, "quantity");

    const result = await markSold(userId, id, quantity);
    res.status(201).json(result);
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.patch(
  "/transactions/:id/quantity",
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const id = req.params.id as string;

      const transaction = await prisma.marketplaceTransaction.findUnique({ where: { id } });
      if (!transaction) throw new MarketplaceError(404, "Transaction not found");
      if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
        throw new MarketplaceError(403, "You are not a party to this transaction");
      }

      const quantity = parsePositiveInt(req.body?.quantity, "quantity");
      const result = await adjustQuantity(id, quantity);
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

marketplaceRouter.post("/transactions/:id/confirm", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const transaction = await prisma.marketplaceTransaction.findUnique({ where: { id } });
    if (!transaction) throw new MarketplaceError(404, "Transaction not found");
    if (transaction.buyerId !== userId) {
      throw new MarketplaceError(403, "Only the buyer can confirm this transaction");
    }

    const result = await confirmTransfer(id, "BUYER_CONFIRM");
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/transactions/:id/cancel", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const transaction = await prisma.marketplaceTransaction.findUnique({ where: { id } });
    if (!transaction) throw new MarketplaceError(404, "Transaction not found");

    const actor =
      transaction.buyerId === userId
        ? "BUYER"
        : transaction.sellerId === userId
          ? "SELLER"
          : null;
    if (!actor) {
      throw new MarketplaceError(403, "You are not a party to this transaction");
    }

    const result = await cancelTransaction(id, actor);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

// List the caller's own transactions — buyer OR seller, newest-first, with an
// optional status filter validated against TRANSACTION_STATUSES (D1, design §9
// \"my buys/sales\"). Returns the same serialized shape as GET /transactions/:id.
marketplaceRouter.get("/transactions", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const where: any = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };

    const status =
      typeof query.status === "string" && query.status ? query.status : undefined;
    if (status !== undefined) {
      if (!isValidTransactionStatus(status)) {
        throw new MarketplaceError(400, "Invalid transaction status");
      }
      where.status = status;
    }

    const transactions = await prisma.marketplaceTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        buyer: { select: { id: true, username: true } },
        seller: { select: { id: true, username: true } },
        card: { select: { id: true, name: true, setName: true } },
      },
    });

    res.json({ transactions });
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.get("/transactions/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const transaction = await prisma.marketplaceTransaction.findUnique({
      where: { id: req.params.id as string },
      include: {
        buyer: { select: { id: true, username: true } },
        seller: { select: { id: true, username: true } },
        card: { select: { id: true, name: true, setName: true } },
      },
    });
    if (!transaction) throw new MarketplaceError(404, "Transaction not found");
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new MarketplaceError(403, "You are not a party to this transaction");
    }

    res.json(transaction);
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.get("/me/pending", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const pending = await prisma.marketplaceTransaction.findMany({
      where: { sellerId: userId, status: "PENDING_CONFIRMATION" },
      orderBy: { soldAt: "asc" },
      include: { buyer: { select: { username: true } } },
    });

    res.json({
      items: pending.map((transaction: any) => ({
        cardId: transaction.cardId,
        variant: transaction.variant,
        quantity: transaction.quantity,
        transactionId: transaction.id,
        buyerUsername: transaction.buyer?.username ?? null,
        soldAt: transaction.soldAt,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/transactions/:id/review", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const transaction = await prisma.marketplaceTransaction.findUnique({ where: { id } });
    if (!transaction) throw new MarketplaceError(404, "Transaction not found");

    let revieweeId: string;
    if (transaction.buyerId === userId) revieweeId = transaction.sellerId;
    else if (transaction.sellerId === userId) revieweeId = transaction.buyerId;
    else throw new MarketplaceError(403, "You are not a party to this transaction");

    if (transaction.status !== "COMPLETED") {
      throw new MarketplaceError(409, "Reviews are only allowed on completed transactions");
    }

    const rating = req.body?.rating;
    if (!isValidRating(rating)) {
      throw new MarketplaceError(400, "Rating must be an integer between 1 and 5");
    }
    const comment = req.body?.comment;
    if (comment !== undefined && comment !== null && typeof comment !== "string") {
      throw new MarketplaceError(400, "Invalid comment");
    }

    const existing = await prisma.marketplaceReview.findUnique({
      where: { transactionId_reviewerId: { transactionId: id, reviewerId: userId } },
    });
    if (existing) {
      throw new MarketplaceError(409, "You have already reviewed this transaction");
    }

    try {
      const review = await prisma.marketplaceReview.create({
        data: {
          transactionId: id,
          reviewerId: userId,
          revieweeId,
          rating,
          comment: (comment ?? null) as string | null,
        },
      });
      res.status(201).json(review);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MarketplaceError(409, "You have already reviewed this transaction");
      }
      throw error;
    }
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/users/:userId/references", async (req: AuthRequest, res: Response) => {
  try {
    const authorId = req.user!.userId;
    const subjectId = req.params.userId as string;

    if (subjectId === authorId) {
      throw new MarketplaceError(400, "You cannot vouch for yourself");
    }
    const comment = req.body?.comment;
    if (typeof comment !== "string" || !comment.trim()) {
      throw new MarketplaceError(400, "Comment is required");
    }

    const subject = await prisma.user.findUnique({ where: { id: subjectId } });
    if (!subject) throw new MarketplaceError(404, "User not found");

    const reference = await prisma.userReference.upsert({
      where: { authorId_subjectId: { authorId, subjectId } },
      create: { authorId, subjectId, comment },
      update: { comment },
    });
    res.json(reference);
  } catch (error) {
    sendError(res, error);
  }
});

marketplaceRouter.post("/reports", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { targetType, targetId, reason } = (req.body ?? {}) as Record<string, unknown>;

    if (!isValidReportTargetType(targetType)) {
      throw new MarketplaceError(400, "Invalid target type");
    }
    if (typeof targetId !== "string" || !targetId) {
      throw new MarketplaceError(400, "targetId is required");
    }
    if (typeof reason !== "string" || !reason.trim()) {
      throw new MarketplaceError(400, "reason is required");
    }

    const report = await prisma.marketplaceReport.create({
      data: {
        reporterId: userId,
        targetType: targetType as string,
        targetId,
        reason,
        status: "OPEN",
      },
    });
    res.status(201).json(report);
  } catch (error) {
    sendError(res, error);
  }
});
