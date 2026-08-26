import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const publicRouter = Router();

type PublicPrice = { variant: string; marketPrice: number | null };

type PublicProfileSource = {
  displayName?: string | null;
  profileImageUrl?: string | null;
  countryOfResidence?: string | null;
  instagram?: string | null;
  instagramVisible?: boolean;
  telegram?: string | null;
  telegramVisible?: boolean;
  facebook?: string | null;
  facebookVisible?: boolean;
  email?: string | null;
  emailVisible?: boolean;
  phoneNumber?: string | null;
  phoneNumberVisible?: boolean;
};

type PublicReferenceSource = {
  id: string;
  name: string;
  description?: string | null;
  contactInfo?: string | null;
  visible: boolean;
};

const FOIL_VARIANTS = ["Foil", "Cold Foil"];
const HOLOFOIL_VARIANTS = ["Holofoil", "Cold Foil", "Foil"];

export function marketPriceForVariant(
  prices: PublicPrice[],
  variants: string[]
): number | null {
  const price = variants
    .map((variant) => prices.find((p) => p.variant.toLowerCase() === variant.toLowerCase()))
    .find((p): p is PublicPrice => Boolean(p));
  return price?.marketPrice ?? null;
}

export function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function addIfPresent(target: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) target[key] = value;
}

export function buildPublicProfile(
  profile: PublicProfileSource | null | undefined,
  references: PublicReferenceSource[] = []
) {
  const payload: Record<string, unknown> = {};
  if (profile) {
    addIfPresent(payload, "displayName", profile.displayName);
    addIfPresent(payload, "profileImageUrl", profile.profileImageUrl);
    addIfPresent(payload, "countryOfResidence", profile.countryOfResidence);
    if (profile.instagramVisible) addIfPresent(payload, "instagram", profile.instagram);
    if (profile.telegramVisible) addIfPresent(payload, "telegram", profile.telegram);
    if (profile.facebookVisible) addIfPresent(payload, "facebook", profile.facebook);
    if (profile.emailVisible) addIfPresent(payload, "email", profile.email);
    if (profile.phoneNumberVisible) addIfPresent(payload, "phoneNumber", profile.phoneNumber);
  }

  const visibleReferences = references
    .filter((reference) => reference.visible)
    .map((reference) => ({
      id: reference.id,
      name: reference.name,
      description: reference.description,
      contactInfo: reference.contactInfo,
    }));

  if (visibleReferences.length > 0) payload.references = visibleReferences;
  return payload;
}

publicRouter.get("/collection/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const { search, color, set, rarity, type, character } = req.query;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        publicEnabled: true,
        profile: true,
        references: true,
      },
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
    if (color && typeof color === "string") cardWhere.color = { in: color.split(",") };
    if (set && typeof set === "string") cardWhere.setName = { in: set.split(",") };
    if (rarity && typeof rarity === "string") cardWhere.rarity = { in: rarity.split(",") };
    if (type && typeof type === "string") cardWhere.types = { hasSome: type.split(",") };
    if (character && typeof character === "string") {
      cardWhere.character = { contains: character, mode: "insensitive" };
    }

    const where: any = { userId };
    if (Object.keys(cardWhere).length > 0) {
      where.card = cardWhere;
    }

    const entries = await prisma.inventoryEntry.findMany({
      where,
      include: { card: { include: { prices: true } } },
    });

    entries.sort((a, b) => {
      const setCompare = compareNullableNumber(a.card.setNumber, b.card.setNumber);
      if (setCompare !== 0) return setCompare;
      const collectorCompare = compareNullableNumber(a.card.collectorNumber, b.card.collectorNumber);
      if (collectorCompare !== 0) return collectorCompare;
      const cardNumberCompare = a.card.cardNumber.localeCompare(b.card.cardNumber);
      if (cardNumberCompare !== 0) return cardNumberCompare;
      return a.card.name.localeCompare(b.card.name);
    });

    const statsEntries = await prisma.inventoryEntry.findMany({
      where: { userId },
      include: { card: { include: { prices: true } } },
    });

    const totalUnique = statsEntries.length;
    const totalCards = statsEntries.reduce(
      (sum, e) => sum + e.quantity + e.foilQuantity + e.holofoilQuantity,
      0
    );

    const bySet: Record<string, number> = {};
    let totalValue = 0;
    let missingPriceCount = 0;
    for (const entry of statsEntries) {
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
      by: ["setName", "setNumber"],
      _count: true,
      orderBy: [{ setNumber: "asc" }, { setName: "asc" }],
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
      holofoilQuantity: e.holofoilQuantity,
    }));

    res.json({
      user: { id: user.id, username: user.username },
      profile: buildPublicProfile((user as any).profile, (user as any).references),
      cards,
      stats: {
        totalUnique,
        totalCards,
        totalValue: Number(totalValue.toFixed(2)),
        missingPriceCount,
        setBreakdown,
      },
    });
  } catch (error) {
    console.error("Public collection error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
