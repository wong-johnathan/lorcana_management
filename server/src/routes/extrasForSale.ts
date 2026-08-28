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
import {
  MARKETPLACE_CONDITIONS,
  MARKETPLACE_CURRENCIES,
  MARKETPLACE_PRICING_MODES,
  evaluateMarketplaceEligibility,
} from "../services/marketplaceAvailability.js";
import { compareCardContainerByIndex } from "../utils/cardSort.js";

const prisma = new PrismaClient();
export const extrasForSaleRouter = Router();

const LISTING_STATUSES = new Set(["active", "paused"]);
const CUSTOM_PRICE_CURRENCIES = ["USD", "SGD", "MYR", "EUR", "GBP", "AUD", "CAD", "JPY"] as const;
const DEFAULT_CUSTOM_PRICE_CURRENCY = "SGD";
const REFERENCE_PRICE_CURRENCY = "USD";

type MarketplacePublicationFields = {
  data: Record<string, unknown>;
  destinationCountryCodes?: string[];
  touched: boolean;
};

function parseCustomPrice(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("customPrice must be a non-negative number");
  }
  return Number(value.toFixed(2));
}

function parseCustomPriceCurrency(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(CUSTOM_PRICE_CURRENCIES as readonly string[]).includes(value)) {
    throw new Error(`customPriceCurrency must be one of ${CUSTOM_PRICE_CURRENCIES.join(", ")}`);
  }
  return value;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function parseOptionalString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalCountryCode(value: unknown, field: string): string | null | undefined {
  const parsed = parseOptionalString(value, field);
  if (parsed === undefined || parsed === null) return parsed;
  const normalized = parsed.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new Error(`${field} must be a two-letter ISO country code`);
  return normalized;
}

function parseAskingPriceMinor(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("askingPriceMinor must be a non-negative integer minor-unit amount");
  }
  return value;
}

function parseMarketplaceEnum(value: unknown, field: string, allowed: readonly string[]): string | null | undefined {
  const parsed = parseOptionalString(value, field);
  if (parsed === undefined || parsed === null) return parsed;
  const normalized = parsed.toUpperCase();
  if (!allowed.includes(normalized)) throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  return normalized;
}

function parseDestinationCountries(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("destinationCountries must be an array of ISO country codes");
  const normalized = value.map((item) => {
    if (typeof item !== "string") throw new Error("destinationCountries must be an array of ISO country codes");
    const code = item.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new Error("destinationCountries must contain two-letter ISO country codes");
    return code;
  });
  return [...new Set(normalized)];
}

function parseMarketplacePublicationFields(body: Record<string, unknown>): MarketplacePublicationFields {
  const data: Record<string, unknown> = {};
  const parsers: Array<[string, unknown, (value: unknown, field: string) => unknown]> = [
    ["marketplaceVisible", body.marketplaceVisible, parseOptionalBoolean],
    ["pricingMode", body.pricingMode, (value, field) => parseMarketplaceEnum(value, field, MARKETPLACE_PRICING_MODES)],
    ["askingPriceMinor", body.askingPriceMinor, () => parseAskingPriceMinor(body.askingPriceMinor)],
    ["currency", body.currency, (value, field) => parseMarketplaceEnum(value, field, MARKETPLACE_CURRENCIES)],
    ["condition", body.condition, (value, field) => parseMarketplaceEnum(value, field, MARKETPLACE_CONDITIONS)],
    ["cardLanguage", body.cardLanguage, (value, field) => parseOptionalString(value, field)?.toUpperCase() ?? null],
    ["originCountryCode", body.originCountryCode, parseOptionalCountryCode],
    ["publicLocality", body.publicLocality, parseOptionalString],
    ["allowsMeetup", body.allowsMeetup, parseOptionalBoolean],
    ["shipsDomestically", body.shipsDomestically, parseOptionalBoolean],
    ["shipsInternationally", body.shipsInternationally, parseOptionalBoolean],
    ["shipsWorldwide", body.shipsWorldwide, parseOptionalBoolean],
  ];

  for (const [field, value, parser] of parsers) {
    if (value !== undefined) data[field] = parser(value, field);
  }

  const destinationCountryCodes = parseDestinationCountries(body.destinationCountries);
  return { data, destinationCountryCodes, touched: Object.keys(data).length > 0 || destinationCountryCodes !== undefined };
}

function destinationCountryCodes(listing: any): string[] {
  return (listing.destinationCountries ?? []).map((country: { countryCode: string } | string) => (
    typeof country === "string" ? country : country.countryCode
  ));
}

async function validateMarketplacePublication(input: {
  userId: string;
  listing: any;
  updates: Record<string, unknown>;
  destinationCountryCodes?: string[];
  publicQuantity: number;
  res: Response;
}): Promise<boolean> {
  const effectiveListing = {
    ...input.listing,
    ...input.updates,
    destinationCountries: input.destinationCountryCodes ?? destinationCountryCodes(input.listing),
  };
  if (!effectiveListing.marketplaceVisible) return true;

  const seller = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!seller?.emailVerifiedAt) {
    input.res.status(403).json({ error: "Seller email must be verified to publish marketplace listings" });
    return false;
  }

  const eligibility = evaluateMarketplaceEligibility({
    listing: effectiveListing,
    seller,
    availableQuantity: input.publicQuantity,
  });
  if (!eligibility.eligible) {
    input.res.status(400).json({ error: "Marketplace listing is not eligible", reasons: eligibility.reasons });
    return false;
  }
  return true;
}

function normalizeNote(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

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
    referencePriceCurrency: REFERENCE_PRICE_CURRENCY,
    customPrice: listing.customPrice ?? null,
    customPriceCurrency: listing.customPriceCurrency ?? DEFAULT_CUSTOM_PRICE_CURRENCY,
    note: listing.note ?? null,
    marketplaceVisible: listing.marketplaceVisible ?? false,
    pricingMode: listing.pricingMode ?? "FIXED",
    askingPriceMinor: listing.askingPriceMinor ?? null,
    currency: listing.currency ?? null,
    condition: listing.condition ?? null,
    cardLanguage: listing.cardLanguage ?? null,
    originCountryCode: listing.originCountryCode ?? null,
    publicLocality: listing.publicLocality ?? null,
    allowsMeetup: listing.allowsMeetup ?? false,
    shipsDomestically: listing.shipsDomestically ?? false,
    shipsInternationally: listing.shipsInternationally ?? false,
    shipsWorldwide: listing.shipsWorldwide ?? false,
    destinationCountries: destinationCountryCodes(listing),
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
        include: { card: { include: { prices: true } }, destinationCountries: true },
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
    let customPrice: number | null | undefined;
    let customPriceCurrency: string | undefined;
    let marketplaceFields: MarketplacePublicationFields;
    try {
      variant = parseVariant(req.body.variant);
      desiredQuantity = parseDesiredQuantity(req.body.desiredQuantity);
      customPrice = parseCustomPrice(req.body.customPrice);
      customPriceCurrency = parseCustomPriceCurrency(req.body.customPriceCurrency);
      marketplaceFields = parseMarketplacePublicationFields(req.body);
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
      prisma.extraForSaleListing.findFirst({ where: { userId, cardId, variant }, include: { destinationCountries: true } }),
    ]);
    const extraQuantity = currentExtraForVariant(entry, policy, override, variant);
    const nextDesiredQuantity = existingListing?.status === "active"
      ? existingListing.desiredQuantity + desiredQuantity
      : desiredQuantity;
    if (nextDesiredQuantity > extraQuantity) {
      res.status(400).json({ error: "Quantity exceeds current extra inventory" });
      return;
    }
    const nextPublicQuantity = publicQuantityForListing(nextDesiredQuantity, extraQuantity);
    const publicationOk = await validateMarketplacePublication({
      userId,
      listing: existingListing ?? { userId, cardId, variant, status: "active" },
      updates: marketplaceFields.data,
      destinationCountryCodes: marketplaceFields.destinationCountryCodes,
      publicQuantity: nextPublicQuantity,
      res,
    });
    if (!publicationOk) return;

    const destinationCountryUpdate = marketplaceFields.destinationCountryCodes !== undefined
      ? { destinationCountries: { deleteMany: {}, create: marketplaceFields.destinationCountryCodes.map((countryCode) => ({ countryCode })) } }
      : {};

    const listing = existingListing
      ? await prisma.extraForSaleListing.update({
        where: { id: existingListing.id },
        data: {
          desiredQuantity: nextDesiredQuantity,
          note: normalizeNote(note),
          ...(customPrice !== undefined && { customPrice }),
          customPriceCurrency: customPriceCurrency ?? existingListing.customPriceCurrency ?? DEFAULT_CUSTOM_PRICE_CURRENCY,
          ...marketplaceFields.data,
          ...destinationCountryUpdate,
          status: "active",
        },
        include: { card: { include: { prices: true } }, destinationCountries: true },
      })
      : await prisma.extraForSaleListing.create({
        data: {
          userId,
          cardId,
          variant,
          desiredQuantity,
          note: normalizeNote(note),
          customPrice: customPrice ?? null,
          customPriceCurrency: customPriceCurrency ?? DEFAULT_CUSTOM_PRICE_CURRENCY,
          ...marketplaceFields.data,
          ...(marketplaceFields.destinationCountryCodes !== undefined && {
            destinationCountries: { create: marketplaceFields.destinationCountryCodes.map((countryCode) => ({ countryCode })) },
          }),
          status: "active",
        },
        include: { card: { include: { prices: true } }, destinationCountries: true },
      });

    const responseStatus = existingListing ? 200 : 201;
    res.status(responseStatus).json({ listing: listingResponse(listing, nextPublicQuantity, referencePriceForVariant(card.prices, variant)) });
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
      include: { card: { include: { prices: true } }, destinationCountries: true },
    });
    if (!existing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    let desiredQuantity: number | undefined;
    let customPrice: number | null | undefined;
    let customPriceCurrency: string | undefined;
    let marketplaceFields: MarketplacePublicationFields;
    if (req.body.desiredQuantity !== undefined) {
      try {
        desiredQuantity = parseDesiredQuantity(req.body.desiredQuantity);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
    }
    try {
      customPrice = parseCustomPrice(req.body.customPrice);
      customPriceCurrency = parseCustomPriceCurrency(req.body.customPriceCurrency);
      marketplaceFields = parseMarketplacePublicationFields(req.body);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
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

    const nextDesired = desiredQuantity ?? existing.desiredQuantity;
    const nextStatus = req.body.status ?? existing.status;
    const publicQuantity = nextStatus === "active" ? publicQuantityForListing(nextDesired, extraQuantity) : 0;
    const publicationOk = await validateMarketplacePublication({
      userId,
      listing: { ...existing, status: nextStatus },
      updates: marketplaceFields.data,
      destinationCountryCodes: marketplaceFields.destinationCountryCodes,
      publicQuantity,
      res,
    });
    if (!publicationOk) return;

    const destinationCountryUpdate = marketplaceFields.destinationCountryCodes !== undefined
      ? { destinationCountries: { deleteMany: {}, create: marketplaceFields.destinationCountryCodes.map((countryCode) => ({ countryCode })) } }
      : {};

    const listing = await prisma.extraForSaleListing.update({
      where: { id },
      data: {
        ...(desiredQuantity !== undefined && { desiredQuantity }),
        ...(req.body.note !== undefined && { note: normalizeNote(req.body.note) }),
        ...(customPrice !== undefined && { customPrice }),
        ...(customPriceCurrency !== undefined && { customPriceCurrency }),
        ...marketplaceFields.data,
        ...destinationCountryUpdate,
        ...(req.body.status !== undefined && { status: req.body.status }),
      },
      include: { card: { include: { prices: true } }, destinationCountries: true },
    });
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
