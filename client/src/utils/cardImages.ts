export type CardImageLike = {
  id?: string | null;
  imageUrl?: string | null;
};

export function cardImageUrl(card: CardImageLike): string {
  if (!card.id) return card.imageUrl || "";
  return `/api/card-images/${encodeURIComponent(card.id)}`;
}
