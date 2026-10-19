export type CardImageLike = {
  id?: string | null;
  imageUrl?: string | null;
};

export function cardImageUrl(card: CardImageLike): string {
  if (!card.id) return card.imageUrl || "";
  return `/api/card-images/${encodeURIComponent(card.id)}`;
}

/**
 * The card's own Lorcana art URL, or "" when the card has no art (REQ-POL-12).
 * The single "no art" source of truth is `Card.imageUrl` empty — NOT
 * `cardImageUrl === ""`, which is non-empty for any card with an id.
 */
export function cardArtUrl(card: CardImageLike): string {
  return card.imageUrl ? cardImageUrl(card) : "";
}
