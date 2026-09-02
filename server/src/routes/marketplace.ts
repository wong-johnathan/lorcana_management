import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateOptional, authenticateToken, AuthRequest } from "../middleware/auth.js";
import {
  DEFAULT_INVENTORY_POLICY,
  calculateExtras,
  referencePriceForVariant,
  resolveKeepCounts,
  type InventoryCounts,
  type InventoryPolicyLike,
  type InventoryVariant,
  type RetentionOverrideLike,
} from "../services/extrasForSale.js";
import {
  sumActiveReservedQuantity,
} from "../services/marketplaceAvailability.js";
import {
  assertEnquiryTransition,
  assertReservationTransition,
  type EnquiryAction,
  type MarketplaceActorRole,
} from "../services/marketplaceTransitions.js";
import {
  PUBLIC_REVIEW_CONTEXT_LABEL,
  planReviewSubmission,
  serializeReview,
} from "../services/marketplaceReviews.js";
import { buildMarketplaceReputation } from "../services/marketplaceReputation.js";
import { buildReviewReportModerationPlan } from "../services/marketplaceModeration.js";
import { broadcastMarketplaceEvent } from "../services/marketplaceRealtime.js";
import { compareCardContainerByIndex } from "../utils/cardSort.js";

const prisma = new PrismaClient() as any;
export const marketplaceRouter = Router();

const MAX_ENQUIRY_MESSAGE_LENGTH = 2000;

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

function listingPrice(listing: any): { amountMinor: number; currency: string } | null {
  if (typeof listing.askingPriceMinor === "number" && listing.currency) {
    return { amountMinor: listing.askingPriceMinor, currency: listing.currency };
  }
  if (typeof listing.customPrice === "number" && listing.customPriceCurrency) {
    return { amountMinor: Math.round(listing.customPrice * 100), currency: listing.customPriceCurrency };
  }
  const variant = parseVariant(listing.variant);
  const referencePrice = variant ? referencePriceForVariant(listing.card?.prices ?? [], variant) : null;
  return referencePrice == null ? null : { amountMinor: Math.round(referencePrice * 100), currency: "USD" };
}

function serializeMoney(amountMinor: number, currency: string) {
  return { amountMinor, currency };
}

function serializeEnquiryOffer(offer: any) {
  return {
    id: offer.id,
    enquiryId: offer.enquiryId,
    proposedBy: offer.proposedByUser ? sellerPayload(offer.proposedByUser) : undefined,
    quantity: offer.quantity,
    unitPrice: serializeMoney(offer.unitPriceMinor, offer.currency),
    createdAt: offer.createdAt,
  };
}

function latestOffer(enquiry: any) {
  const offers = [...(enquiry.offers ?? [])];
  offers.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
  return offers.at(-1) ?? null;
}

function serializeEnquiry(enquiry: any) {
  const listing = enquiry.listing;
  const latest = latestOffer(enquiry);
  const quantity = enquiry.reservation?.quantity ?? enquiry.quantity;
  return {
    id: enquiry.id,
    status: enquiry.status,
    listingId: enquiry.listingId,
    buyer: sellerPayload(enquiry.buyer),
    seller: sellerPayload(listing.user),
    card: listing.card,
    variant: listing.variant,
    quantity,
    pricingMode: listing.pricingMode ?? "FIXED",
    askingPrice: listingPrice(listing),
    lastActivityAt: enquiry.lastActivityAt,
    unreadCount: 0,
    latestOffer: latest ? {
      quantity: latest.quantity,
      unitPrice: serializeMoney(latest.unitPriceMinor, latest.currency),
    } : null,
    messages: (enquiry.messages ?? []).map((message: any) => ({
      id: message.id,
      enquiryId: message.enquiryId,
      sender: sellerPayload(message.sender),
      message: message.message,
      createdAt: message.createdAt,
    })),
    offers: (enquiry.offers ?? []).map(serializeEnquiryOffer),
    reservation: serializeReservation(enquiry.reservation),
  };
}

function participantRole(enquiry: any, userId: string): MarketplaceActorRole | null {
  if (enquiry.buyerId === userId) return "BUYER";
  if (enquiry.listing?.userId === userId) return "SELLER";
  return null;
}

function counterpartyUserId(enquiry: any, actorUserId: string) {
  return actorUserId === enquiry.buyerId ? enquiry.listing.userId : enquiry.buyerId;
}

const ENQUIRY_INCLUDE = {
  listing: {
    include: {
      card: true,
      user: { select: { id: true, username: true, emailVerifiedAt: true, createdAt: true } },
      destinationCountries: true,
    },
  },
  buyer: { select: { id: true, username: true, emailVerifiedAt: true, createdAt: true } },
  messages: {
    include: { sender: { select: { id: true, username: true, emailVerifiedAt: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  },
  offers: {
    include: { proposedByUser: { select: { id: true, username: true, emailVerifiedAt: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  },
  reservation: true,
};

function parsePositiveInt(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}

function parseMinorAmount(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer minor-unit amount`);
  return value;
}

function parseOfferInput(body: any, listing: any) {
  if (body.currency !== undefined) throw new Error("currency is inherited from the listing");
  if (body.shippingPriceMinor !== undefined || body.fulfilmentMethod !== undefined || body.buyerCountryCode !== undefined) {
    throw new Error("shipping, fulfilment, and buyer country are handled in chat for now");
  }
  const price = listingPrice(listing);
  if (!price) throw new Error("listing price or currency is unavailable");
  return {
    quantity: parsePositiveInt(body.quantity, "quantity"),
    unitPriceMinor: parseMinorAmount(body.unitPriceMinor, "unitPriceMinor"),
    currency: price.currency,
  };
}

async function loadEnquiry(db: any, id: string) {
  return db.marketplaceEnquiry.findUnique({ where: { id }, include: ENQUIRY_INCLUDE });
}

function ensureParticipant(enquiry: any, userId: string, res: Response): MarketplaceActorRole | null {
  const role = participantRole(enquiry, userId);
  if (!role) res.status(403).json({ error: "Not allowed to access this enquiry" });
  return role;
}

function mapTransitionError(error: unknown, res: Response) {
  res.status(400).json({ error: error instanceof Error ? error.message : "Invalid marketplace transition" });
}

function reservationExpiry(now = new Date()) {
  return new Date(now.getTime() + 48 * 60 * 60 * 1000);
}

function serializeReservation(reservation: any) {
  if (!reservation) return null;
  return {
    id: reservation.id,
    listingId: reservation.listingId,
    enquiryId: reservation.enquiryId,
    acceptedOfferId: reservation.acceptedOfferId ?? null,
    quantity: reservation.quantity,
    unitPriceMinor: reservation.unitPriceMinor,
    currency: reservation.currency,
    expiresAt: reservation.expiresAt,
    status: reservation.status,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  };
}

function serializeOffer(listing: any, availableQuantity: number) {
  const destinationCountries = destinationCountryCodes(listing);
  const variant = parseVariant(listing.variant);
  const referencePrice = variant ? referencePriceForVariant(listing.card?.prices ?? [], variant) : null;
  const price = listingPrice(listing);
  return {
    listingId: listing.id,
    cardId: listing.cardId,
    variant: listing.variant,
    availableQuantity,
    pricingMode: listing.pricingMode ?? "FIXED",
    askingPriceMinor: price?.amountMinor ?? null,
    currency: price?.currency ?? null,
    askingPrice: price,
    approximateConvertedPrice: null,
    condition: listing.condition ?? null,
    cardLanguage: listing.cardLanguage ?? null,
    originCountryCode: listing.originCountryCode ?? null,
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
    referencePrice,
    referencePriceCurrency: "USD",
  };
}

function tagsCreateMany(tags: string[]) {
  return tags.length ? { create: tags.map((tag) => ({ tag })) } : undefined;
}

async function availabilityForListing(listing: any, now = new Date(), db: any = prisma) {
  const variant = parseVariant(listing.variant);
  if (!variant) return { availableQuantity: 0, eligible: false, reasons: ["invalid variant"] };

  const [entry, policyRecord, override, reservations] = await Promise.all([
    db.inventoryEntry.findFirst({ where: { userId: listing.userId, cardId: listing.cardId } }),
    db.userInventoryPolicy.findUnique({ where: { userId: listing.userId } }),
    db.cardRetentionOverride.findUnique({ where: { userId_cardId: { userId: listing.userId, cardId: listing.cardId } } }),
    db.marketplaceReservation.findMany({
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

  return {
    availableQuantity,
    eligible: listing.status === "active" && availableQuantity > 0,
    reasons: listing.status === "active" ? [] : ["listing is not active"],
  };
}

function marketplaceListingWhere(query: Record<string, unknown>, cardId?: string, excludeUserId?: string | null) {
  const where: any = { status: "active" };
  if (cardId) where.cardId = cardId;
  if (excludeUserId) where.userId = { not: excludeUserId };

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

async function eligibleOffers(query: Record<string, unknown>, cardId?: string, excludeUserId?: string | null) {
  const destinationCountry = typeof query.destinationCountry === "string"
    ? query.destinationCountry.toUpperCase()
    : typeof query.shipsTo === "string"
      ? query.shipsTo.toUpperCase()
      : null;
  const listings = await prisma.extraForSaleListing.findMany({
    where: marketplaceListingWhere(query, cardId, excludeUserId),
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

marketplaceRouter.get("/", authenticateOptional, async (req: AuthRequest, res: Response) => {
  try {
    const offers = await eligibleOffers(req.query as Record<string, unknown>, undefined, req.user?.userId);
    const grouped = new Map<string, any>();

    for (const offer of offers) {
      const key = `${offer.listing.cardId}:${offer.listing.variant}`;
      const price = listingPrice(offer.listing);
      const existing = grouped.get(key) ?? {
        cardId: offer.listing.cardId,
        card: offer.listing.card,
        variant: offer.listing.variant,
        availableQuantity: 0,
        sellerCount: 0,
        offersCount: 0,
        fromPriceMinor: price?.amountMinor ?? null,
        currency: price?.currency ?? null,
        lowestPrice: price,
        approximateConvertedPrice: null,
        canFulfilToViewer: true,
        offers: [],
      };
      existing.availableQuantity += offer.availableQuantity;
      existing.sellerCount += 1;
      existing.offersCount += 1;
      if (price && (!existing.lowestPrice || (price.currency === existing.currency && price.amountMinor < existing.fromPriceMinor))) {
        existing.fromPriceMinor = price.amountMinor;
        existing.currency = price.currency;
        existing.lowestPrice = price;
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

marketplaceRouter.get("/cards/:cardId/offers", authenticateOptional, async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params as { cardId: string };
    const offers = await eligibleOffers(req.query as Record<string, unknown>, cardId, req.user?.userId);
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

    if (req.body.quantity !== undefined && (typeof req.body.quantity !== "number" || !Number.isInteger(req.body.quantity) || req.body.quantity <= 0)) {
      res.status(400).json({ error: "quantity must be a positive integer" });
      return;
    }
    const quantity = req.body.quantity ?? null;
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (message.length > MAX_ENQUIRY_MESSAGE_LENGTH) {
      res.status(400).json({ error: "message must be 2000 characters or fewer" });
      return;
    }

    const listing = await prisma.extraForSaleListing.findFirst({
      where: { id: listingId, status: "active" },
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
    if (req.body.shippingPriceMinor !== undefined || req.body.fulfilmentMethod !== undefined || req.body.buyerCountryCode !== undefined) {
      res.status(400).json({ error: "shipping, fulfilment, and buyer country are handled in chat for now" });
      return;
    }
    if (req.body.currency !== undefined) {
      res.status(400).json({ error: "currency is inherited from the listing" });
      return;
    }
    let initialOfferInput: ReturnType<typeof parseOfferInput> | null = null;
    if (req.body.unitPriceMinor !== undefined) {
      if (listing.pricingMode !== "ACCEPTS_OFFERS") {
        res.status(400).json({ error: "Fixed-price listings do not accept counteroffers" });
        return;
      }
      try {
        initialOfferInput = parseOfferInput(req.body, listing);
      } catch (error) {
        mapTransitionError(error, res);
        return;
      }
    }

    const existingActiveEnquiry = await prisma.marketplaceEnquiry.findFirst({
      where: {
        listingId,
        buyerId,
        status: { in: ["PENDING_SELLER", "AWAITING_BUYER", "RESERVED"] },
      },
      select: { id: true },
    });
    if (existingActiveEnquiry) {
      res.status(409).json({ error: "An active enquiry already exists for this listing", enquiryId: existingActiveEnquiry.id });
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
        quantity,
        status: "PENDING_SELLER",
        lastActivityAt: new Date(),
      },
    });
    if (message) {
      await prisma.enquiryMessage.create({ data: { enquiryId: enquiry.id, senderId: buyerId, message } });
    }
    if (initialOfferInput) {
      await prisma.enquiryOffer.create({ data: { enquiryId: enquiry.id, proposedByUserId: buyerId, ...initialOfferInput } });
    }
    await prisma.notification.create({
      data: { userId: listing.userId, type: "MARKETPLACE_ENQUIRY_CREATED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id },
    });

    res.status(201).json({ enquiry });
  } catch (error) {
    console.error("Marketplace enquiry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.get("/enquiries", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const enquiries = await prisma.marketplaceEnquiry.findMany({
      where: { OR: [{ buyerId: userId }, { listing: { userId } }] },
      include: ENQUIRY_INCLUDE,
      orderBy: { lastActivityAt: "desc" },
    }) ?? [];
    res.json({ enquiries: enquiries.map(serializeEnquiry) });
  } catch (error) {
    console.error("Marketplace enquiries list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.get("/enquiries/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const enquiry = await loadEnquiry(prisma, req.params.id as string);
    if (!enquiry) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }
    if (!ensureParticipant(enquiry, req.user!.userId, res)) return;
    res.json({ enquiry: serializeEnquiry(enquiry) });
  } catch (error) {
    console.error("Marketplace enquiry detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/enquiries/:id/messages", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = req.user!.userId;
    const enquiry = await loadEnquiry(prisma, req.params.id as string);
    if (!enquiry) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }
    if (!ensureParticipant(enquiry, actorUserId, res)) return;
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    if (message.length > MAX_ENQUIRY_MESSAGE_LENGTH) {
      res.status(400).json({ error: "message must be 2000 characters or fewer" });
      return;
    }
    const created = await prisma.enquiryMessage.create({ data: { enquiryId: enquiry.id, senderId: actorUserId, message } });
    await prisma.marketplaceEnquiry.update({ where: { id: enquiry.id }, data: { lastActivityAt: new Date() } });
    await prisma.notification.create({ data: { userId: counterpartyUserId(enquiry, actorUserId), type: "MARKETPLACE_MESSAGE_CREATED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id } });
    broadcastMarketplaceEvent({ type: "message.created", enquiryId: enquiry.id, payload: { id: created.id } });
    res.status(201).json({ message: created });
  } catch (error) {
    console.error("Marketplace message error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/enquiries/:id/offers", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = req.user!.userId;
    const enquiry = await loadEnquiry(prisma, req.params.id as string);
    if (!enquiry) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }
    const actorRole = ensureParticipant(enquiry, actorUserId, res);
    if (!actorRole) return;
    if (enquiry.listing.pricingMode !== "ACCEPTS_OFFERS") {
      res.status(400).json({ error: "Fixed-price listings do not accept counteroffers" });
      return;
    }
    let input;
    try {
      input = parseOfferInput(req.body, enquiry.listing);
    } catch (error) {
      mapTransitionError(error, res);
      return;
    }
    let nextStatus;
    try {
      const isFirstBuyerOffer = actorRole === "BUYER" && enquiry.status === "PENDING_SELLER" && (enquiry.offers?.length ?? 0) === 0;
      const action: EnquiryAction = actorRole === "SELLER"
        ? "SELLER_COUNTER"
        : isFirstBuyerOffer ? "BUYER_OFFER" : "BUYER_COUNTER";
      nextStatus = assertEnquiryTransition({ currentStatus: enquiry.status, action, actorRole });
    } catch (error) {
      mapTransitionError(error, res);
      return;
    }
    const offer = await prisma.enquiryOffer.create({ data: { enquiryId: enquiry.id, proposedByUserId: actorUserId, ...input } });
    await prisma.marketplaceEnquiry.update({ where: { id: enquiry.id }, data: { status: nextStatus, lastActivityAt: new Date() } });
    await prisma.notification.create({ data: { userId: counterpartyUserId(enquiry, actorUserId), type: "MARKETPLACE_OFFER_CREATED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id } });
    broadcastMarketplaceEvent({ type: "offer.created", enquiryId: enquiry.id, payload: { id: offer.id } });
    broadcastMarketplaceEvent({ type: "enquiry.status_changed", enquiryId: enquiry.id, payload: { status: nextStatus } });
    res.status(201).json({ offer: serializeEnquiryOffer(offer) });
  } catch (error) {
    console.error("Marketplace offer error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/enquiries/:id/accept", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = req.user!.userId;
    const result = await prisma.$transaction(async (tx: any) => {
      const enquiry = await loadEnquiry(tx, req.params.id as string);
      if (!enquiry) return { status: 404, body: { error: "Enquiry not found" } };
      const actorRole = participantRole(enquiry, actorUserId);
      if (!actorRole) return { status: 403, body: { error: "Not allowed to access this enquiry" } };
      const pricingMode = enquiry.listing.pricingMode ?? "FIXED";
      const action: EnquiryAction = actorRole === "SELLER" ? "SELLER_ACCEPT" : "BUYER_ACCEPT";
      try {
        assertEnquiryTransition({ currentStatus: enquiry.status, action, actorRole });
      } catch (error) {
        return { status: 400, body: { error: error instanceof Error ? error.message : "Invalid marketplace transition" } };
      }

      const accepted = latestOffer(enquiry);
      let reservationTerms: { acceptedOfferId: string | null; quantity: number; unitPriceMinor: number; currency: string };
      if (pricingMode === "FIXED") {
        if (actorRole !== "SELLER") return { status: 400, body: { error: "Only the seller can accept fixed-price enquiries" } };
        const price = listingPrice(enquiry.listing);
        if (!price) return { status: 400, body: { error: "Fixed-price listing needs a price before acceptance" } };
        reservationTerms = {
          acceptedOfferId: null,
          quantity: enquiry.quantity ?? 1,
          unitPriceMinor: price.amountMinor,
          currency: price.currency,
        };
      } else {
        if (!accepted) return { status: 400, body: { error: "OBO enquiries need an offer before acceptance" } };
        if (accepted.proposedByUserId === actorUserId) return { status: 400, body: { error: "Cannot accept your own offer" } };
        reservationTerms = {
          acceptedOfferId: accepted.id,
          quantity: accepted.quantity,
          unitPriceMinor: accepted.unitPriceMinor,
          currency: accepted.currency,
        };
      }

      const availability = await availabilityForListing(enquiry.listing, new Date(), tx);
      if (!availability.eligible || reservationTerms.quantity > availability.availableQuantity) {
        return { status: 409, body: { error: "Listing is no longer available for that quantity" } };
      }
      const reservation = await tx.marketplaceReservation.create({
        data: {
          listingId: enquiry.listingId,
          enquiryId: enquiry.id,
          acceptedOfferId: reservationTerms.acceptedOfferId,
          quantity: reservationTerms.quantity,
          unitPriceMinor: reservationTerms.unitPriceMinor,
          currency: reservationTerms.currency,
          status: "RESERVED",
          expiresAt: reservationExpiry(),
        },
      });
      await tx.marketplaceEnquiry.update({ where: { id: enquiry.id }, data: { status: "RESERVED", lastActivityAt: new Date() } });
      await tx.notification.create({ data: { userId: counterpartyUserId(enquiry, actorUserId), type: "MARKETPLACE_RESERVATION_CREATED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id } });
      return { status: 201, body: { reservation: serializeReservation(reservation) } };
    });
    res.status(result.status).json(result.body);
    if (result.status === 201 && result.body.reservation?.enquiryId) {
      broadcastMarketplaceEvent({ type: "reservation.created", enquiryId: result.body.reservation.enquiryId, payload: { id: result.body.reservation.id } });
      broadcastMarketplaceEvent({ type: "enquiry.status_changed", enquiryId: result.body.reservation.enquiryId, payload: { status: "RESERVED" } });
    }
  } catch (error) {
    console.error("Marketplace accept error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/enquiries/:id/decline", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = req.user!.userId;
    const enquiry = await loadEnquiry(prisma, req.params.id as string);
    if (!enquiry) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }
    const actorRole = ensureParticipant(enquiry, actorUserId, res);
    if (!actorRole) return;
    let nextStatus;
    try {
      nextStatus = assertEnquiryTransition({ currentStatus: enquiry.status, action: "SELLER_DECLINE", actorRole });
    } catch (error) {
      mapTransitionError(error, res);
      return;
    }
    const updated = await prisma.marketplaceEnquiry.update({ where: { id: enquiry.id }, data: { status: nextStatus, lastActivityAt: new Date() }, include: ENQUIRY_INCLUDE });
    await prisma.notification.create({ data: { userId: enquiry.buyerId, type: "MARKETPLACE_ENQUIRY_DECLINED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id } });
    broadcastMarketplaceEvent({ type: "enquiry.status_changed", enquiryId: enquiry.id, payload: { status: nextStatus } });
    res.json({ enquiry: serializeEnquiry(updated) });
  } catch (error) {
    console.error("Marketplace decline error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/enquiries/:id/withdraw", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = req.user!.userId;
    const enquiry = await loadEnquiry(prisma, req.params.id as string);
    if (!enquiry) {
      res.status(404).json({ error: "Enquiry not found" });
      return;
    }
    const actorRole = ensureParticipant(enquiry, actorUserId, res);
    if (!actorRole) return;
    let nextStatus;
    try {
      nextStatus = assertEnquiryTransition({ currentStatus: enquiry.status, action: "BUYER_WITHDRAW", actorRole });
    } catch (error) {
      mapTransitionError(error, res);
      return;
    }
    const updated = await prisma.marketplaceEnquiry.update({ where: { id: enquiry.id }, data: { status: nextStatus, lastActivityAt: new Date() }, include: ENQUIRY_INCLUDE });
    await prisma.notification.create({ data: { userId: enquiry.listing.userId, type: "MARKETPLACE_ENQUIRY_WITHDRAWN", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id } });
    broadcastMarketplaceEvent({ type: "enquiry.status_changed", enquiryId: enquiry.id, payload: { status: nextStatus } });
    res.json({ enquiry: serializeEnquiry(updated) });
  } catch (error) {
    console.error("Marketplace withdraw error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/reservations/expire-due", authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.marketplaceReservation.updateMany({
      where: { status: "RESERVED", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    res.json({ expired: result.count });
  } catch (error) {
    console.error("Marketplace reservation expiry error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

marketplaceRouter.post("/reservations/:id/cancel", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const actorUserId = req.user!.userId;
    const reservation = await prisma.marketplaceReservation.findUnique({ where: { id: req.params.id as string }, include: { enquiry: ENQUIRY_INCLUDE } });
    if (!reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }
    const enquiry = reservation.enquiry;
    if (!ensureParticipant(enquiry, actorUserId, res)) return;
    try {
      assertReservationTransition({ currentStatus: reservation.status, action: "CANCEL", actorRole: participantRole(enquiry, actorUserId)! });
    } catch (error) {
      mapTransitionError(error, res);
      return;
    }
    const updated = await prisma.marketplaceReservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
    await prisma.marketplaceEnquiry.update({ where: { id: enquiry.id }, data: { status: "CANCELLED", lastActivityAt: new Date() } });
    await prisma.notification.create({ data: { userId: counterpartyUserId(enquiry, actorUserId), type: "MARKETPLACE_RESERVATION_CANCELLED", relatedType: "MarketplaceEnquiry", relatedId: enquiry.id } });
    broadcastMarketplaceEvent({ type: "reservation.cancelled", enquiryId: enquiry.id, payload: { id: reservation.id } });
    broadcastMarketplaceEvent({ type: "enquiry.status_changed", enquiryId: enquiry.id, payload: { status: "CANCELLED" } });
    res.json({ reservation: serializeReservation(updated) });
  } catch (error) {
    console.error("Marketplace reservation cancel error:", error);
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
