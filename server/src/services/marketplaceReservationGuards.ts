export const ACTIVE_RESERVATION_CONFLICT_MESSAGE = "Active marketplace reservations must be resolved before changing reserved inventory";

export function activeReservationWhere(now = new Date()) {
  return { status: "RESERVED", expiresAt: { gt: now } };
}

export async function hasActiveReservationsForUserListings(
  prisma: any,
  userId: string,
  cardId?: string,
  now = new Date()
): Promise<boolean> {
  const reservations = await prisma.marketplaceReservation.findMany({
    where: {
      ...activeReservationWhere(now),
      listing: {
        userId,
        ...(cardId ? { cardId } : {}),
      },
    },
    take: 1,
    select: { id: true },
  }) ?? [];
  return reservations.length > 0;
}
