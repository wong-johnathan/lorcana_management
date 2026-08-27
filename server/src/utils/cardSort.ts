export type CardIndexLike = {
  setNumber?: number | null;
  collectorNumber?: number | null;
  cardNumber: string;
  name: string;
};

export type CardContainer<TCard extends CardIndexLike = CardIndexLike> = {
  card: TCard;
};

export function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function compareCardByIndex(a: CardIndexLike, b: CardIndexLike): number {
  const setCompare = compareNullableNumber(a.setNumber, b.setNumber);
  if (setCompare !== 0) return setCompare;
  const collectorCompare = compareNullableNumber(a.collectorNumber, b.collectorNumber);
  if (collectorCompare !== 0) return collectorCompare;
  const cardNumberCompare = a.cardNumber.localeCompare(b.cardNumber);
  if (cardNumberCompare !== 0) return cardNumberCompare;
  return a.name.localeCompare(b.name);
}

export function compareCardContainerByIndex<T extends CardContainer>(a: T, b: T): number {
  return compareCardByIndex(a.card, b.card);
}
