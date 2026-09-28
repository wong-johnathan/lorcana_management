export interface MarketplaceAvailabilityInput {
  ownedQuantity: number;
  keepQuantity: number;
  desiredQuantity: number;
  reservedQuantity?: number;
}

export interface MarketplaceAvailability {
  physicalExtra: number;
  listableQuantity: number;
  availableQuantity: number;
}

export interface ReservationLike {
  quantity: number;
  status: string;
  expiresAt: Date | string;
}

export function calculateMarketplaceAvailability(input: MarketplaceAvailabilityInput): MarketplaceAvailability {
  const physicalExtra = Math.max(0, input.ownedQuantity - input.keepQuantity);
  const listableQuantity = Math.max(0, Math.min(input.desiredQuantity, physicalExtra));
  const availableQuantity = Math.max(0, listableQuantity - Math.max(0, input.reservedQuantity ?? 0));
  return { physicalExtra, listableQuantity, availableQuantity };
}

export function sumActiveReservedQuantity(reservations: ReservationLike[], now = new Date()): number {
  return reservations.reduce((total, reservation) => {
    const expiresAt = reservation.expiresAt instanceof Date ? reservation.expiresAt : new Date(reservation.expiresAt);
    if (reservation.status === "RESERVED" && expiresAt > now) {
      return total + Math.max(0, reservation.quantity);
    }
    return total;
  }, 0);
}
