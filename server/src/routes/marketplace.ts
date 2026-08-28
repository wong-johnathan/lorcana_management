import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  DEFAULT_INVENTORY_POLICY,
  calculateExtras,
  resolveKeepCounts,
  type InventoryCounts,
  type InventoryPolicyLike,
  type InventoryVariant,
  type RetentionOverrideLike,
} from "../services/extrasForSale.js";
import {
  evaluateMarketplaceEligibility,
  sumActiveReservedQuantity,
} from "../services/marketplaceAvailability.js";
import {
  PUBLIC_REVIEW_CONTEXT_LABEL,
  planReviewSubmission,
  serializeReview,
} from "../services/marketplaceReviews.js";
import { buildMarketplaceReputation } from "../services/marketplaceReputation.js";
import { buildReviewReportModerationPlan } from "../services/marketplaceModeration.js";
import { compareCardContainerByIndex } from "../utils/cardSort.js";

const prisma = new PrismaClient() as any;
export const marketplaceRouter = Router();

const MAX_ENQUIRY_MESSAGE_LENGTH = 2000;
const DEFAULT_ENQUIRY_MESSAGE = "Marketplace enquiry started.";

function parseVariant(value: string): InventoryVariant | null {
  if (value === "normal" || value === "foil" || value === "holofoil") return value;
  return null;
}

function getVariantCount(counts: InventoryCounts, variant: InventoryVariant): number {
  if (variant === "normal") return counts.quantity;
  if (variant === "foil") return counts.foilQuantity;
  return counts.holofoilQuantity;
}

function destinationCountryCodes(listing: any): string[] {
  return (listing.destinationCountries ?? []).map((country: { countryCode: string } | string) => (
    typeof country === "string" ? country : country.countryCode
  ));
}

function sellerPayload(user: any) {
  return {
    id: user.id,
    username: user.username,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    memberSince: user.createdAt ?? null,
  };
}

function minimalReputation(user: any) {
  return {
    userId: user.id,
    role: "seller",
    ratingAverage: null,
    reviewCount: 0,
    completedDeals: 0,
    uniqueCounterparties: 0,
    memberSince: user.createdAt ?? new Date(0).toISOString(),
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}

function canFulfilTo(listing: any, destinationCountry?: string | null): boolean {
  if (!destinationCountry) return true;
  const country = destinationCountry.toUpperCase();
  if (listing.shipsWorldwide) return true;
  if (listing.originCountryCode === country && (listing.shipsDomestically || listing.allowsMeetup)) return true;
  if (listing.shipsInternationally && destinationCountryCodes(listing).includes(country)) return true;
  return false;
}

function serializeOffer(listing: any, availableQuantity: number) {
  const destinationCountries = destinationCountryCodes(listing);
  const currency = listing.currency as string;
  const amountMinor = listing.askingPriceMinor as number;
  return {
    listingId: listing.id,
    cardId: listing.cardId,
    variant: listing.variant,
    availableQuantity,
    pricingMode: listing.pricingMode ?? "FIXED",
    askingPriceMinor: amountMinor,
    currency,
    askingPrice: { amountMinor, currency },
    approximateConvertedPrice: null,
    condition: listing.condition,
    cardLanguage: listing.cardLanguage,
    originCountryCode: listing.originCountryCode,
    publicLocality: listing.publicLocality ?? null,
    allowsMeetup: listing.allowsMeetup ?? false,
    shipsDomestically: listing.shipsDomestically ?? false,
    shipsInternationally: listing.shipsInternationally ?? false,
    shipsWorldwide: listing.shipsWorldwide ?? false,
    destinationCountries,
    fulfilment: {
      allowsMeetup: listing.allowsMeetup ?? false,
      shipsDomestically: listing.shipsDomestically ?? false,
      shipsInternationally: listing.shipsInternationally ?? false,
      shipsWorldwide: listing.shipsWorldwide ?? false,
      destinationCountryCodes: destinationCountries,
    },
    seller: sellerPayload(listing.user),
    sellerVerified: Boolean(listing.user?.emailVerifiedAt),
    reputation: minimalReputation(listing.user),
    note: listing.note ?? null,
    conditionDisclaimer: "Condition reported by seller; no physical photos provided.",
  };
}

function tagsCreateMany(tags: string[]) {
  return tags.length ? { create: tags.map((tag) => ({ tag })) } : undefined;
}

async function availabilityForListing(listing: any, now = new Date()) {
  const variant = parseVariant(listing.variant);
  if (!variant) return { availableQuantity: 0, eligible: false, reasons: ["invalid variant"] };

  const [entry, policyRecord, override, reservations] = await Promise.all([
    prisma.inventoryEntry.findFirst({ where: { userId: listing.userId, cardId: listing.cardId } }),
    prisma.userInventoryPolicy.findUnique({ where: { userId: listing.userId } }),
    prisma.cardRetentionOverride.findUnique({ where: { userId_cardId: { userId: listing.userId, cardId: listing.cardId } } }),
    prisma.marketplaceReservation.findMany({
      where: { listingId: listing.id, status: "RESERVED", expiresAt: { gt: now } },
    }),
  ]);

  const policy = (policyRecord ?? DEFAULT_INVENTORY_POLICY) as InventoryPolicyLike;
  const keep = resolveKeepCounts(policy, override as RetentionOverrideLike | null);
  const owned = entry
    ? { quantity: entry.quantity, foilQuantity: entry.foilQuantity, holofoilQuantity: entry.holofoilQuantity }
    : { quantity: 0, foilQuantity: 0, holofoilQuantity: 0 };
  const extras = calculateExtras(owned, keep);
  const reservedQuantity = sumActiveReservedQuantity(reservations, now);
  const listableQuantity = Math.max(0, Math.min(listing.desiredQuantity, getVariantCount(extras, variant)));
  const availableQuantity = Math.max(0, listableQuantity - reservedQuantity);
  const eligibility = evaluateMarketplaceEligibility({
    listing: { ...listing, destinationCountries: destinationCountryCodes(listing) },
    seller: listing.user,
    availableQuantity,
  });

  return { availableQuantity, eligible: eligibility.eligible, reasons: eligibility.reasons };
}

function marketplaceListingWhere(query: Record<string, unknown>, cardId?: string) {
  const where: any = { status: "active", marketplaceVisible: true };
  if (cardId) where.cardId = cardId;

  const cardWhere: any = {};
  if (typeof query.search === "string" && query.search.trim()) {
    const search = query.search.trim();
    cardWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { subtitle: { contains: search, mode: "insensitive" } },
      { cardNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  if (typeof query.set === "string") cardWhere.setName = { in: query.set.split(",") };
  if (typeof query.rarity === "string") cardWhere.rarity = { in: query.rarity.split(",") };
  if (typeof query.color === "string") cardWhere.color = { in: query.color.split(",") };
  if (Object.keys(cardWhere).length > 0) where.card = cardWhere;

  if (typeof query.variant === "string") where.variant = query.variant;
  if (typeof query.condition === "string") where.condition = { in: query.condition.split(",").map((item) => item.toUpperCase()) };
  if (typeof query.language === "string") where.cardLanguage = query.language.toUpperCase();
  if (typeof query.sellerCountry === "string") where.originCountryCode = query.sellerCountry.toUpperCase();
  if (query.fulfilmentMethod === "MEETUP") where.allowsMeetup = true;
  if (query.fulfilmentMethod === "DOMESTIC_SHIPPING") where.shipsDomestically = true;
  if (query.fulfilmentMethod === "INTERNATIONAL_SHIPPING") where.shipsInternationally = true;
  return where;
}

async function eligibleOffers(query: Record<string, unknown>, cardId?: string) {
  const destinationCountry = typeof query.destinationCountry === "string"
    ? query.destinationCountry.toUpperCase()
    : typeof query.shipsTo === "string"
      ? query.shipsTo.toUpperCase()
      : null;
  const listings = await prisma.extraForSaleListing.findMany({
    where: marketplaceListingWhere(query, cardId),
    include: {
      card: { include: { prices: true } },
      user: { select: { id: true, username: true, emailVerifiedAt: true, createdAt: true } },
      destinationCountries: true,
    },
  }) as any[];

  const offers: Array<{ listing: any; availableQuantity: number }> = [];
  for (const listing of listings.sort(compareCardContainerByIndex)) {
    if (!canFulfilTo(listing, destinationCountry)) continue;
    const availability = await availabilityForListing(listing);
    if (!availability.eligible) continue;
    offers.push({ listing, availableQuantity: availability.availableQuantity });
  }
  return offers;
}

marketplaceRouter.get("/", async (req, res: Response) => {
  try {
    const offers = await eligibleOffers(req.query as Record<string, unknown>);
    const grouped = new Map<string, any>();

    for (const offer of offers) {
      const key = `${offer.listing.cardId}:${offer.listing.variant}`;
      const amountMinor = offer.listing.askingPriceMinor as number;
      const existing = grouped.get(key) ?? {
        cardId: offer.listing.cardId,
        card: offer.listing.card,
        variant: offer.listing.variant,
        availableQuantity: 0,
        sellerCount: 0,
        offersCount: 0,
        fromPriceMinor: amountMinor,
        currency: offer.listing.currency,
        lowestPrice: { amountMinor, currency: offer.listing.currency },
        approximateConvertedPrice: null,
        canFulfilToViewer: true,
        offers: [],
      };
      existing.availableQuantity += offer.availableQuantity;
      existing.sellerCount += 1;
      existing.offersCount += 1;
      if (offer.listing.currency === existing.currency && amountMinor < existing.fromPriceMinor) {
        existing.fromPriceMinor = amountMinor;
        existing.lowestPrice = { amountMinor, currency: offer.listing.currency };
      }
      existing.offers.push(serializeOffer(offer.listing, offer.availableQuantity));
      grouped.set(key, existing);
    }

    res.json({ results: [...grouped.values()] });
  } catch (error) {
    console.error("Marketplace browse error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.get("/cards/:cardId/offers", async (req, res: Response) => {
  try {
    const { cardId } = req.params as { cardId: string };
    const offers = await eligibleOffers(req.query as Record<string, unknown>, cardId);
    const card = offers[0]?.listing.card ?? await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json({
      card,
      offers: offers.map((offer) => serializeOffer(offer.listing, offer.availableQuantity)),
    });
  } catch (error) {
    console.error("Marketplace card offers error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/listings/:listingId/enquiries", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const buyerId = req.user!.userId;
    const { listingId } = req.params as { listingId: string };
    const buyer = await prisma.user.findUnique({
      where: { id: buyerId },
      select: { id: true, username: true, emailVerifiedAt: true },
    });
    if (!buyer?.emailVerifiedAt) {
      res.status(403).json({ error: "Verified email required to enquire" });
      return;
    }

    const quantity = req.body.quantity === undefined ? 1 : req.body.quantity;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
      res.status(400).json({ error: "quantity must be a positive integer" });
      return;
    }
    const message = typeof req.body.message === "string" && req.body.message.trim()
      ? req.body.message.trim()
      : DEFAULT_ENQUIRY_MESSAGE;
    if (message.length > MAX_ENQUIRY_MESSAGE_LENGTH) {
      res.status(400).json({ error: "message must be 2000 characters or fewer" });
      return;
    }

    const listing = await prisma.extraForSaleListing.findFirst({
      where: { id: listingId, status: "active", marketplaceVisible: true },
      include: {
        card: true,
        user: { select: { id: true, username: true, emailVerifiedAt: true, createdAt: true } },
        destinationCountries: true,
      },
    });
    if (!listing) {
      res.status(404).json({ error: "Marketplace listing not found" });
      return;
    }
    if (listing.userId === buyerId) {
      res.status(400).json({ error: "Cannot enquire on your own listing" });
      return;
    }

    const availability = await availabilityForListing(listing);
    if (!availability.eligible || quantity > availability.availableQuantity) {
      res.status(400).json({ error: "Listing is not currently available" });
      return;
    }

    const enquiry = await prisma.marketplaceEnquiry.create({
      data: {
        listingId,
        buyerId,
        status: "PENDING_SELLER",
        lastActivityAt: new Date(),
      },
    });
    await prisma.enquiryMessage.create({ data: { enquiryId: enquiry.id, senderId: buyerId, message } });
    await prisma.enquiryOffer.create({
      data: {
        enquiryId: enquiry.id,
        proposedByUserId: buyerId,
        quantity,
        unitPriceMinor: listing.askingPriceMinor,
        shippingPriceMinor: 0,
        currency: listing.currency,
        fulfilmentMethod: listing.allowsMeetup ? "MEETUP" : "SHIPPING",
        buyerCountryCode: req.body.buyerCountryCode ?? null,
      },
    });
    await prisma.notification.create({
      data: { userId: listing.userId, type: "MARKETPLACE_ENQUIRY_CREATED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id },
    });

    res.status(201).json({ enquiry });
  } catch (error) {
    console.error("Marketplace enquiry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/transactions/:id/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const transactionId = req.params.id as string;
    const actorUserId = req.user!.userId;
    const now = new Date();
    const transaction = await prisma.marketplaceTransaction.findUnique({
      where: { id: transactionId },
      include: { reviews: { include: { tags: true } } },
    });
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const reviews = transaction.reviews ?? [];
    const existingReview = reviews.find((review: any) => review.reviewerId === actorUserId) ?? null;
    const counterpartReview = reviews.find((review: any) => review.reviewerId !== actorUserId && review.status === "SEALED") ?? null;
    let plan;
    try {
      plan = planReviewSubmission({
        transaction,
        actorUserId,
        existingReview,
        counterpartReview,
        now,
        input: req.body,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }

    let review;
    if (plan.mode === "update" && existingReview) {
      await prisma.marketplaceReviewTag.deleteMany({ where: { reviewId: existingReview.id } });
      review = await prisma.marketplaceReview.update({
        where: { id: existingReview.id },
        data: {
          rating: plan.reviewData.rating,
          comment: plan.reviewData.comment,
          status: plan.reviewData.status,
          moderationStatus: plan.reviewData.moderationStatus,
          submittedAt: plan.reviewData.submittedAt,
          revealedAt: plan.reviewData.revealedAt,
          tags: tagsCreateMany(plan.tags),
        },
        include: { tags: true },
      });
    } else {
      review = await prisma.marketplaceReview.create({
        data: {
          transactionId: plan.reviewData.transactionId,
          reviewerId: plan.reviewData.reviewerId,
          revieweeId: plan.reviewData.revieweeId,
          reviewerRole: plan.reviewData.reviewerRole,
          rating: plan.reviewData.rating,
          comment: plan.reviewData.comment,
          status: plan.reviewData.status,
          moderationStatus: plan.reviewData.moderationStatus,
          submittedAt: plan.reviewData.submittedAt,
          revealedAt: plan.reviewData.revealedAt,
          tags: tagsCreateMany(plan.tags),
        },
        include: { tags: true },
      });
    }

    if (plan.revealReviewIds.length > 0) {
      await prisma.marketplaceReview.updateMany({
        where: { id: { in: plan.revealReviewIds } },
        data: { status: "REVEALED", revealedAt: now },
      });
    }

    res.status(plan.mode === "create" ? 201 : 200).json({
      review: serializeReview(review),
      publicContextLabel: PUBLIC_REVIEW_CONTEXT_LABEL,
    });
  } catch (error) {
    console.error("Marketplace review submit error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.get("/users/:userId/reputation", async (req, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true, emailVerifiedAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [reviewsReceived, completedTransactions] = await Promise.all([
      prisma.marketplaceReview.findMany({
        where: { revieweeId: userId },
        include: { tags: true, transaction: true },
      }),
      prisma.marketplaceTransaction.findMany({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }], status: "COMPLETED" },
      }),
    ]);
    res.json(buildMarketplaceReputation({ user, reviewsReceived, completedTransactions, now: new Date() }));
  } catch (error) {
    console.error("Marketplace reputation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/reviews/:id/report", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const reviewId = req.params.id as string;
    const reporterId = req.user!.userId;
    const review = await prisma.marketplaceReview.findUnique({ where: { id: reviewId } });
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }
    let plan;
    try {
      plan = buildReviewReportModerationPlan({ reporterId, reviewId, input: req.body });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    const report = await prisma.marketplaceReport.create({ data: plan.reportData });
    await prisma.marketplaceReview.update({
      where: { id: reviewId },
      data: { moderationStatus: plan.reviewModerationStatus },
    });
    res.status(201).json({ report: { id: report.id, status: report.status } });
  } catch (error) {
    console.error("Marketplace report error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
